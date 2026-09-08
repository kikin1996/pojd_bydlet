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
  VideoStream,
  type RemoteTrack,
  type Track,
  type VideoFrame,
} from "@livekit/rtc-node";
import { z } from "zod";
import { loadPropertyContext, saveInquiry as saveInquiryToDb } from "./property-context.js";

// Must match AI_AGENT_NAME in src/app/api/livekit/token/route.ts of the main app
export const AI_AGENT_NAME = "pojd-bydlet-assistant";

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

    const { property, instructions } = await loadPropertyContext(propertyId);
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
    // to actual frame sampling (unlike the Python SDK), so we do it ourselves:
    // keep the latest camera frame around and attach it to the chat message
    // whenever the prospective tenant finishes speaking.
    let latestFrame: VideoFrame | undefined;
    const watchedTrackSids = new Set<string>();
    function watchVideoTrack(track: Track) {
      if (track.kind !== TrackKind.KIND_VIDEO) return;
      if (track.sid && watchedTrackSids.has(track.sid)) return;
      if (track.sid) watchedTrackSids.add(track.sid);
      console.log(`Watching video track ${track.sid} for frames`);
      (async () => {
        for await (const event of new VideoStream(track)) {
          if (!latestFrame) console.log("Received first video frame from camera");
          latestFrame = event.frame;
        }
      })();
    }

    // Covers tracks subscribed *after* this point...
    ctx.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => watchVideoTrack(track));
    // ...and the camera track, which auto-subscribes as part of `ctx.connect()`
    // above and so may already be subscribed by the time we get here.
    for (const participant of ctx.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.track) watchVideoTrack(publication.track);
      }
    }

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

    const agent = voice.Agent.create({
      instructions,
      tools: { saveInquiry },
    });

    const session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({ voice: "marin" }),
    });

    await session.start({ agent, room: ctx.room });

    // `onUserTurnCompleted` (the hook the docs suggest for this) never fires
    // with a RealtimeModel — turn detection happens server-side inside
    // OpenAI's realtime session, so there's no local "user turn" for the
    // Node SDK's STT-pipeline hook to attach to. Instead, periodically push
    // the latest camera frame straight into the agent's chat context; the
    // realtime plugin diffs that against what OpenAI already has and sends
    // just the new image. Replace the previous frame each time so the
    // context (and OpenAI's per-image token cost) doesn't grow unbounded.
    let lastImageMessageId: string | undefined;
    const frameInterval = setInterval(async () => {
      if (!latestFrame) return;
      try {
        const chatCtx = agent.chatCtx.copy();
        if (lastImageMessageId) {
          try {
            chatCtx.remove(lastImageMessageId);
          } catch {
            // already gone
          }
        }
        const message = chatCtx.addMessage({
          role: "user",
          content: [createImageContent({ image: latestFrame })],
        });
        lastImageMessageId = message.id;
        await agent.updateChatCtx(chatCtx);
      } catch (error) {
        console.error("Failed to push camera frame to chat context:", error);
      }
    }, 3000);
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
