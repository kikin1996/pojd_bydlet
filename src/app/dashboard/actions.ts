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

  let pairingCode = generatePairingCode();
  // Extremely unlikely collision, but guard against it anyway.
  while (await prisma.device.findUnique({ where: { pairingCode } })) {
    pairingCode = generatePairingCode();
  }

  const parsedPrice = typeof price === "string" && price.trim() ? Number(price) : null;
  const parsedSize = typeof size === "string" && size.trim() ? Number(size) : null;

  await prisma.property.create({
    data: {
      name: name.trim(),
      address: address.trim(),
      note: typeof note === "string" && note.trim() ? note.trim() : null,
      price: parsedPrice !== null && !Number.isNaN(parsedPrice) ? parsedPrice : null,
      layout: typeof layout === "string" && layout.trim() ? layout.trim() : null,
      size: parsedSize !== null && !Number.isNaN(parsedSize) ? parsedSize : null,
      ownerId: session.user.id,
      device: { create: { pairingCode } },
    },
  });

  revalidatePath("/dashboard");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
