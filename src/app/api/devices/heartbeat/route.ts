import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pairingCode = body?.pairingCode;
  if (typeof pairingCode !== "string") {
    return NextResponse.json({ error: "Chybí pairingCode." }, { status: 400 });
  }

  const result = await prisma.device.updateMany({
    where: { pairingCode },
    data: { lastSeenAt: new Date() },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Neplatný párovací kód." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
