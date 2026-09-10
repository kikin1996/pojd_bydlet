"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/lib/auth";

export async function registerAction(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof name !== "string" || !name.trim()) {
    return "Jméno je povinné.";
  }
  if (typeof email !== "string" || !email.trim()) {
    return "E-mail je povinný.";
  }
  if (typeof password !== "string" || password.length < 8) {
    return "Heslo musí mít alespoň 8 znaků.";
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    return "Účet s tímto e-mailem už existuje.";
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { name: name.trim(), email: normalizedEmail, passwordHash },
  });

  try {
    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Účet byl vytvořen, ale přihlášení se nezdařilo. Zkus se přihlásit ručně.";
    }
    throw error;
  }
}
