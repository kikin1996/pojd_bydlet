import "dotenv/config";
import { fileURLToPath } from "node:url";
import {
  ServerOptions,
  cli,
  defineAgent,
  tool,
  voice,
  type JobContext,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import { RoomEvent } from "@livekit/rtc-node";
import { z } from "zod";
import { loadPropertyContext, prisma } from "./property-context.js";

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

    // Leave once the kiosk device (or anyone else) leaves and no one but the
    // agent itself remains — otherwise a stale agent from an earlier session
    // keeps talking alongside a newly dispatched one.
    ctx.room.on(RoomEvent.ParticipantDisconnected, () => {
      if (ctx.room.remoteParticipants.size === 0) {
        ctx.shutdown("room is empty");
      }
    });

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
        await prisma.inquiry.create({ data: { propertyId, ...args } });
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
