"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePairingCode } from "@/lib/pairing-code";

export async function createPropertyAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const name = formData.get("name");
  const address = formData.get("address");
  const note = formData.get("note");
  const price = formData.get("price");
  const layout = formData.get("layout");
  const size = formData.get("size");

  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Název nemovitosti je povinný.");
  }
  if (typeof address !== "string" || !address.trim()) {
    throw new Error("Adresa je povinná.");
  }

  const pairingCode = await uniquePairingCode();

  const parsedPrice = typeof price === "string" && price.trim() ? Number(price) : null;
  const parsedSize = typeof size === "string" && size.trim() ? Number(size) : null;

  const property = await prisma.property.create({
    data: {
      name: name.trim(),
      address: address.trim(),
      note: typeof note === "string" && note.trim() ? note.trim() : null,
      price: parsedPrice !== null && !Number.isNaN(parsedPrice) ? parsedPrice : null,
      layout: typeof layout === "string" && layout.trim() ? layout.trim() : null,
      size: parsedSize !== null && !Number.isNaN(parsedSize) ? parsedSize : null,
      ownerId: session.user.id,
      devices: { create: { pairingCode, room: "Hlavní místnost" } },
    },
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard/properties/${property.id}`);
}

async function uniquePairingCode() {
  let pairingCode = generatePairingCode();
  // Extremely unlikely collision, but guard against it anyway.
  while (await prisma.device.findUnique({ where: { pairingCode } })) {
    pairingCode = generatePairingCode();
  }
  return pairingCode;
}

export async function addRoomDeviceAction(propertyId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property || property.ownerId !== session.user.id) {
    throw new Error("Nemovitost nenalezena.");
  }

  const room = formData.get("room");
  if (typeof room !== "string" || !room.trim()) {
    throw new Error("Název místnosti je povinný.");
  }

  const pairingCode = await uniquePairingCode();

  await prisma.device.create({
    data: { propertyId, pairingCode, room: room.trim() },
  });

  revalidatePath(`/dashboard/properties/${propertyId}`);
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
