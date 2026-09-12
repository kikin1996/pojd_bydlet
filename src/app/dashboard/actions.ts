"use server";

import { extractText } from "unpdf";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePairingCode } from "@/lib/pairing-code";
import { uploadPropertyDocument } from "@/lib/supabase-storage";

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

export async function addDocumentAction(propertyId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property || property.ownerId !== session.user.id) {
    throw new Error("Nemovitost nenalezena.");
  }

  const title = formData.get("title");
  const file = formData.get("file");
  if (typeof title !== "string" || !title.trim()) {
    throw new Error("Název dokumentu je povinný.");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Vyber PDF soubor.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { text } = await extractText(bytes, { mergePages: true });
  if (!text.trim()) {
    throw new Error("Z tohoto PDF se nepodařilo přečíst žádný text (může jít o naskenované obrázky).");
  }

  const fileUrl = await uploadPropertyDocument(propertyId, file);

  await prisma.propertyDocument.create({
    data: { propertyId, title: title.trim(), content: text, fileUrl },
  });

  revalidatePath(`/dashboard/properties/${propertyId}`);
}

export async function deleteDocumentAction(propertyId: string, documentId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property || property.ownerId !== session.user.id) {
    throw new Error("Nemovitost nenalezena.");
  }

  await prisma.propertyDocument.delete({ where: { id: documentId, propertyId } });
  revalidatePath(`/dashboard/properties/${propertyId}`);
}

export async function updateAgentInstructionsAction(propertyId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property || property.ownerId !== session.user.id) {
    throw new Error("Nemovitost nenalezena.");
  }

  const agentInstructions = formData.get("agentInstructions");

  await prisma.property.update({
    where: { id: propertyId },
    data: {
      agentInstructions:
        typeof agentInstructions === "string" && agentInstructions.trim()
          ? agentInstructions.trim()
          : null,
    },
  });

  revalidatePath(`/dashboard/properties/${propertyId}`);
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
