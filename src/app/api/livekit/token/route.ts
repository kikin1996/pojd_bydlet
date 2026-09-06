import { NextResponse } from "next/server";
import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
  ParticipantInfo_State,
} from "livekit-server-sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Must match the agentName the worker registers with in agent/src/index.ts
export const AI_AGENT_NAME = "pojd-bydlet-assistant";

// ParticipantInfo_Kind.AGENT — not re-exported by livekit-server-sdk, so inlined
// (see @livekit/protocol's livekit_models_pb.d.ts).
const AGENT_PARTICIPANT_KIND = 4;

export function roomNameForProperty(propertyId: string) {
  return `property-${propertyId}`;
}

async function dispatchAgent(roomName: string, propertyId: string) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !wsUrl) return;

  const httpUrl = wsUrl.replace(/^ws/, "http");

  // Avoid dispatching a duplicate agent (e.g. on a kiosk page reload) while a
  // previous one is still connected to this room — otherwise multiple AI
  // participants end up talking over each other. The room doesn't exist yet
  // on LiveKit's side until a client actually connects, so listParticipants
  // 404s on the very first join; that just means there's no agent yet.
  let hasActiveAgent = false;
  try {
    const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    const participants = await roomService.listParticipants(roomName);
    hasActiveAgent = participants.some(
      (p) =>
        p.kind === AGENT_PARTICIPANT_KIND &&
        p.state !== ParticipantInfo_State.DISCONNECTED,
    );
  } catch (error) {
    console.error("Failed to list room participants before dispatch:", error);
  }
  if (hasActiveAgent) return;

  try {
    const dispatchClient = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
    await dispatchClient.createDispatch(roomName, AI_AGENT_NAME, {
      metadata: JSON.stringify({ propertyId }),
    });
  } catch (error) {
    // Dispatch is best-effort: the kiosk device should still be able to
    // connect and stream even if the AI agent worker isn't running.
    console.error("Failed to dispatch AI agent:", error);
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json(
      { error: "LiveKit není nakonfigurovaný (chybí env proměnné)." },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || (body.role !== "viewer" && body.role !== "device")) {
    return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });
  }

  if (body.role === "viewer") {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nepřihlášeno." }, { status: 401 });
    }

    const propertyId = body.propertyId;
    if (typeof propertyId !== "string") {
      return NextResponse.json({ error: "Chybí propertyId." }, { status: 400 });
    }

    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || property.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Nenalezeno." }, { status: 404 });
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: `viewer-${session.user.id}`,
      name: session.user.name ?? "Makléř",
    });
    token.addGrant({
      room: roomNameForProperty(property.id),
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return NextResponse.json({ token: await token.toJwt(), url });
  }

  const pairingCode = body.pairingCode;
  if (typeof pairingCode !== "string") {
    return NextResponse.json({ error: "Chybí pairingCode." }, { status: 400 });
  }

  const device = await prisma.device.findUnique({
    where: { pairingCode },
    include: { property: true },
  });
  if (!device) {
    return NextResponse.json({ error: "Neplatný párovací kód." }, { status: 404 });
  }

  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  const token = new AccessToken(apiKey, apiSecret, {
    identity: `device-${device.id}`,
    name: device.property.name,
  });
  token.addGrant({
    room: roomNameForProperty(device.propertyId),
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  await dispatchAgent(roomNameForProperty(device.propertyId), device.propertyId);

  return NextResponse.json({
    token: await token.toJwt(),
    url,
    propertyName: device.property.name,
    propertyAddress: device.property.address,
  });
}
