"use server";

import { prisma } from "@/lib/prisma";

export type BookingFormState = { status: "idle" | "success" | "error"; message?: string };

export async function createBookingAction(
  propertyId: string,
  _prevState: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const name = formData.get("name");
  const email = formData.get("email");
  const phone = formData.get("phone");
  const preferredAt = formData.get("preferredAt");
  const message = formData.get("message");

  if (typeof name !== "string" || !name.trim()) {
    return { status: "error", message: "Vyplň prosím jméno." };
  }
  if (
    (typeof email !== "string" || !email.trim()) &&
    (typeof phone !== "string" || !phone.trim())
  ) {
    return { status: "error", message: "Vyplň e-mail nebo telefon, ať se ti můžeme ozvat." };
  }
  if (typeof preferredAt !== "string" || !preferredAt) {
    return { status: "error", message: "Vyber preferovaný termín prohlídky." };
  }

  const preferredAtDate = new Date(preferredAt);
  if (Number.isNaN(preferredAtDate.getTime())) {
    return { status: "error", message: "Termín prohlídky se nepodařilo rozpoznat." };
  }

  await prisma.booking.create({
    data: {
      propertyId,
      name: name.trim(),
      email: typeof email === "string" && email.trim() ? email.trim() : null,
      phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
      preferredAt: preferredAtDate,
      message: typeof message === "string" && message.trim() ? message.trim() : null,
    },
  });

  return { status: "success", message: "Díky! Ozveme se a potvrdíme termín prohlídky." };
}
