import { NextResponse } from "next/server";
import {
  AccessToken,
  RoomConfiguration,
  RoomAgentDispatch,
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
  token.roomConfig = agentRoomConfig(device.propertyId);

  return NextResponse.json({
    token: await token.toJwt(),
    url,
    propertyName: device.property.name,
    propertyAddress: device.property.address,
  });
}
