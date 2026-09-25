import { NextResponse } from "next/server";
import {
  AccessToken,
  AgentDispatchClient,
  RoomConfiguration,
  RoomAgentDispatch,
  RoomServiceClient,
} from "livekit-server-sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Must match the agentName the worker registers with in agent/src/index.ts
export const AI_AGENT_NAME = "pojd-bydlet-assistant";

export function roomNameForProperty(propertyId: string) {
  return `property-${propertyId}`;
}

// Attaching agent dispatch to the room's *creation* (via the token's
// roomConfig) instead of firing a separate AgentDispatchClient.createDispatch
// call from our own code sidesteps a race condition: a room is only created
// once (the first participant to join with that name creates it), so LiveKit
// only honors this dispatch once too — even if the kiosk page fires the
// token request twice (React StrictMode in dev, a flaky reconnect, two open
// tabs), we never end up with two AI agents talking over each other.
function agentRoomConfig(propertyId: string) {
  return new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: AI_AGENT_NAME,
        metadata: JSON.stringify({ propertyId }),
      }),
    ],
  });
}

const PARTICIPANT_KIND_AGENT = 4;

// The roomConfig dispatch above only fires when a room is *created*. If the
// last human leaves (e.g. a kiosk page reload), the agent shuts itself down
// but the room lingers for a while — a device rejoining then lands in a
// live room with no agent and no new dispatch. So when the room already
// exists and has no agent, dispatch one explicitly. (A room that doesn't
// exist yet is left to the roomConfig path, so we never double-dispatch
// there; the agent itself also backs off if it finds a duplicate.)
async function ensureAgentInExistingRoom(url: string, apiKey: string, apiSecret: string, propertyId: string) {
  const httpUrl = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  const roomName = roomNameForProperty(propertyId);
  try {
    const participants = await new RoomServiceClient(httpUrl, apiKey, apiSecret).listParticipants(roomName);
    if (participants.some((p) => p.kind === PARTICIPANT_KIND_AGENT)) return;
    await new AgentDispatchClient(httpUrl, apiKey, apiSecret).createDispatch(roomName, AI_AGENT_NAME, {
      metadata: JSON.stringify({ propertyId }),
    });
  } catch {
    // Room doesn't exist yet (or LiveKit hiccup): the token's roomConfig
    // dispatch covers the first-join case.
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

  await ensureAgentInExistingRoom(url, apiKey, apiSecret, device.propertyId);

  const token = new AccessToken(apiKey, apiSecret, {
    identity: `device-${device.id}`,
    name: device.property.name,
    metadata: JSON.stringify({ room: device.room }),
  });
  token.addGrant({
    room: roomNameForProperty(device.propertyId),
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });
  token.roomConfig = agentRoomConfig(device.propertyId);

  return NextResponse.json({
    token: await token.toJwt(),
    url,
    room: device.room,
    propertyName: device.property.name,
    propertyAddress: device.property.address,
  });
}
