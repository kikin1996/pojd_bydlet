import "dotenv/config";
import { fileURLToPath } from "node:url";
import {
  ServerOptions,
  cli,
  createImageContent,
  defineAgent,
  tool,
  voice,
  type JobContext,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import {
  ParticipantKind,
  RoomEvent,
  TrackKind,
  VideoBufferType,
  VideoStream,
  type RemoteParticipant,
  type RemoteTrack,
  type Track,
  type VideoFrame,
} from "@livekit/rtc-node";
import { z } from "zod";
import {
  loadPropertyContext,
  saveInquiry as saveInquiryToDb,
  searchDocuments,
} from "./property-context.js";

// Must match AI_AGENT_NAME in src/app/api/livekit/token/route.ts of the main app
export const AI_AGENT_NAME = "pojd-bydlet-assistant";

// A property can have one camera device per room. We don't want to flood the
// model with every room's image on every tick, so we only ever show it the
// rooms with the most recent motion — capped at this many at once.
const MAX_ACTIVE_ROOMS = 2;
// How long a room stays "active" after its last detected motion, so the
// image doesn't flicker away the instant someone stands still for a beat.
const MOTION_GRACE_MS = 8_000;
const MOTION_CHECK_INTERVAL_MS = 1_000;
const IMAGE_PUSH_INTERVAL_MS = 3_000;
// Average per-sample luma delta (0-255) between two checks that counts as motion.
const MOTION_THRESHOLD = 10;
// Sample every Nth pixel on each axis when fingerprinting a frame — a full
// pixel-by-pixel diff is unnecessary for "did something move" and far more
// expensive per room per second.
const MOTION_SAMPLE_STEP = 16;

interface RoomFeed {
  room: string;
  latestFrame?: VideoFrame;
  lastMotionAt: number;
  lastFingerprint?: Float32Array;
}

function roomLabelForParticipant(participant: RemoteParticipant): string | undefined {
  if (!participant.metadata) return undefined;
  try {
    const parsed = JSON.parse(participant.metadata);
    return typeof parsed.room === "string" ? parsed.room : undefined;
  } catch {
    return undefined;
  }
}

// The Y (luma) plane of an I420 frame is already a per-pixel brightness map,
// so sampling it directly is much cheaper than converting to RGBA and doing
// weighted-channel luminance math just to detect motion.
function fingerprintFrame(frame: VideoFrame): Float32Array | undefined {
  const y = frame.type === VideoBufferType.I420 ? frame : frame.convert(VideoBufferType.I420);
  const plane = y.getPlane(0);
  if (!plane) return undefined;

  const samples: number[] = [];
  for (let row = 0; row < y.height; row += MOTION_SAMPLE_STEP) {
    const rowOffset = row * y.width;
    for (let col = 0; col < y.width; col += MOTION_SAMPLE_STEP) {
      samples.push(plane[rowOffset + col]);
    }
  }
  return Float32Array.from(samples);
}

function fingerprintDelta(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    let propertyId: string | undefined;
    try {
      const metadata = JSON.parse(ctx.job.metadata || "{}");
      propertyId = typeof metadata.propertyId === "string" ? metadata.propertyId : undefined;
    } catch {
      // malformed metadata, handled below
    }

    if (!propertyId) {
      console.error("Job started without a propertyId in metadata, shutting down.");
      ctx.shutdown("missing propertyId");
      return;
    }

    const { property, documents, instructions } = await loadPropertyContext(propertyId);
    // Set by the switchCamera tool below, once `feeds` exists.
    let pinnedRoom: { room: string; until: number } | undefined;
    console.log(`Agent joining room for property "${property.name}" (${property.id})`);

    // Leave once no human (kiosk device, viewer, ...) is left in the room —
    // ignoring other agent participants, which would otherwise keep this
    // count above zero forever if more than one ever ends up in the room.
    ctx.room.on(RoomEvent.ParticipantDisconnected, () => {
      const hasHumanParticipant = Array.from(
        ctx.room.remoteParticipants.values(),
      ).some((p) => p.kind !== ParticipantKind.AGENT);
      if (!hasHumanParticipant) {
        ctx.shutdown("room has no human participants left");
      }
    });

    // The Node.js LiveKit Agents SDK doesn't yet wire up `inputOptions.videoEnabled`
    // to actual frame sampling (unlike the Python SDK), so we track camera
    // tracks ourselves — one feed per room (each kiosk device tags its own
    // room via participant metadata set in the LiveKit token).
    const feeds = new Map<string, RoomFeed>();
    const watchedTrackSids = new Set<string>();

    function watchVideoTrack(track: Track, participant: RemoteParticipant) {
      if (track.kind !== TrackKind.KIND_VIDEO) return;
      if (track.sid && watchedTrackSids.has(track.sid)) return;
      if (track.sid) watchedTrackSids.add(track.sid);

      const room = roomLabelForParticipant(participant) ?? "Hlavní místnost";
      if (!feeds.has(room)) feeds.set(room, { room, lastMotionAt: 0 });
      console.log(`Watching video track ${track.sid} for frames (room: ${room})`);

      (async () => {
        for await (const event of new VideoStream(track)) {
          const feed = feeds.get(room);
          if (feed) feed.latestFrame = event.frame;
        }
      })();
    }

    // Covers tracks subscribed *after* this point...
    ctx.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication, participant) =>
      watchVideoTrack(track, participant),
    );
    // ...and camera tracks that auto-subscribed as part of `ctx.connect()`
    // above and so may already be subscribed by the time we get here.
    for (const participant of ctx.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.track) watchVideoTrack(publication.track, participant);
      }
    }

    // Cheap per-room motion check, independent of how often we actually push
    // images to the model (see frameInterval below).
    const motionInterval = setInterval(() => {
      for (const feed of feeds.values()) {
        if (!feed.latestFrame) continue;
        try {
          const fingerprint = fingerprintFrame(feed.latestFrame);
          if (!fingerprint) continue;
          if (feed.lastFingerprint) {
            const delta = fingerprintDelta(fingerprint, feed.lastFingerprint);
            if (delta > MOTION_THRESHOLD) feed.lastMotionAt = Date.now();
          }
          feed.lastFingerprint = fingerprint;
        } catch (error) {
          console.error(`Motion check failed for room "${feed.room}":`, error);
        }
      }
    }, MOTION_CHECK_INTERVAL_MS);
    ctx.addShutdownCallback(async () => clearInterval(motionInterval));

    const saveInquiry = tool({
      description:
        "Ulož informace zjištěné od zájemce o bytě (rozpočet, termín nastěhování, kontakt, poznámky). Zavolej kdykoliv zjistíš novou informaci, i částečnou — klidně opakovaně.",
      parameters: z.object({
        budget: z.string().optional().describe("Rozpočet zájemce, např. '15000 Kč/měsíc'"),
        moveInDate: z.string().optional().describe("Kdy se chce zájemce nastěhovat"),
        contactName: z.string().optional().describe("Jméno zájemce"),
        contactPhone: z.string().optional().describe("Telefonní kontakt"),
        contactEmail: z.string().optional().describe("E-mailový kontakt"),
        notes: z.string().optional().describe("Cokoliv dalšího důležitého, co zájemce zmínil"),
      }),
      execute: async (args) => {
        await saveInquiryToDb(propertyId, args);
        return "Uloženo.";
      },
    });

    const switchCamera = tool({
      description:
        "Podívej se cíleně na kameru v konkrétní místnosti, i když v ní teď není detekovaný pohyb — použij, když potřebuješ vidět jinou místnost, než kde se zájemce zrovna nachází (např. se zeptá na kuchyň, ale stojí v obýváku).",
      parameters: z.object({
        room: z.string().describe("Přesný název místnosti, přesně jak byl uveden v instrukcích (např. 'Ložnice')."),
      }),
      execute: async ({ room }) => {
        const feed = feeds.get(room);
        if (!feed) {
          const available = Array.from(feeds.keys()).join(", ") || "žádná zatím není připojená";
          return `Kamera "${room}" neexistuje nebo není připojená. Dostupné kamery: ${available}.`;
        }
        if (!feed.latestFrame) {
          return `Kamera "${room}" je připojená, ale zatím z ní nemám žádný obraz.`;
        }
        pinnedRoom = { room, until: Date.now() + 15_000 };
        return `Dívám se teď do místnosti "${room}".`;
      },
    });

    const searchPropertyDocuments = tool({
      description:
        "Vyhledej informaci v nahraných dokumentech k bytu (smlouva, energetický štítek, pravidla domu...). Použij, když se zájemce zeptá na něco, co by mohlo být v oficiálním dokumentu, místo abys hádal.",
      parameters: z.object({
        query: z.string().describe("Co hledáš, např. 'výše kauce' nebo 'pravidla pro domácí mazlíčky'"),
      }),
      execute: async ({ query }) => searchDocuments(documents, query),
    });

    const agent = voice.Agent.create({
      instructions,
      tools: { saveInquiry, switchCamera, searchPropertyDocuments },
    });

    const session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({ voice: "marin" }),
    });

    await session.start({ agent, room: ctx.room });

    // `onUserTurnCompleted` (the hook the docs suggest for this) never fires
    // with a RealtimeModel — turn detection happens server-side inside
    // OpenAI's realtime session, so there's no local "user turn" for the
    // Node SDK's STT-pipeline hook to attach to. Instead, periodically push
    // the latest frames from whichever room(s) currently have motion straight
    // into the agent's chat context; the realtime plugin diffs that against
    // what OpenAI already has and sends just the new images.
    const pushedImageMessageIds = new Map<string, string>(); // room -> chat message id
    const frameInterval = setInterval(async () => {
      const now = Date.now();
      let activeFeeds = Array.from(feeds.values())
        .filter((feed) => feed.latestFrame && now - feed.lastMotionAt <= MOTION_GRACE_MS)
        .sort((a, b) => b.lastMotionAt - a.lastMotionAt)
        .slice(0, MAX_ACTIVE_ROOMS);

      // Nothing moved recently anywhere — fall back to a single camera so the
      // AI isn't blind while the visitor stands still.
      if (activeFeeds.length === 0) {
        const fallback = Array.from(feeds.values())
          .filter((feed) => feed.latestFrame)
          .sort((a, b) => b.lastMotionAt - a.lastMotionAt)[0];
        if (fallback) activeFeeds = [fallback];
      }

      // The switchCamera tool lets the agent deliberately look somewhere
      // without motion — honor that for a short window regardless of what
      // motion detection picked, so the tool call has a visible effect.
      if (pinnedRoom) {
        if (pinnedRoom.until < now) {
          pinnedRoom = undefined;
        } else {
          const pinnedFeed = feeds.get(pinnedRoom.room);
          if (pinnedFeed?.latestFrame && !activeFeeds.includes(pinnedFeed)) {
            activeFeeds = [pinnedFeed, ...activeFeeds].slice(0, MAX_ACTIVE_ROOMS);
          }
        }
      }

      if (activeFeeds.length === 0) return;

      try {
        const chatCtx = agent.chatCtx.copy();
        for (const messageId of pushedImageMessageIds.values()) {
          try {
            chatCtx.remove(messageId);
          } catch {
            // already gone
          }
        }
        pushedImageMessageIds.clear();

        for (const feed of activeFeeds) {
          if (!feed.latestFrame) continue;
          const message = chatCtx.addMessage({
            role: "user",
            content: [`Kamera: ${feed.room}`, createImageContent({ image: feed.latestFrame })],
          });
          pushedImageMessageIds.set(feed.room, message.id);
        }
        await agent.updateChatCtx(chatCtx);
      } catch (error) {
        console.error("Failed to push camera frames to chat context:", error);
      }
    }, IMAGE_PUSH_INTERVAL_MS);
    ctx.addShutdownCallback(async () => {
      clearInterval(frameInterval);
    });
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: AI_AGENT_NAME,
    }),
  );
}
