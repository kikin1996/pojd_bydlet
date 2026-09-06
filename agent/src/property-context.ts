import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
export const prisma = new PrismaClient({ adapter });

export async function loadPropertyContext(propertyId: string) {
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
  });

  const instructions = [
    `Jsi profesionální realitní AI makléř, který právě vede vzdálenou prohlídku bytu "${property.name}" na adrese ${property.address}. Zájemce je fyzicky v bytě, ty ho slyšíš a mluvíš k němu přes reproduktor.`,
    property.note
      ? `Informace o bytě, ze kterých máš čerpat: ${property.note}`
      : "O bytě zatím nemáš žádné doplňující informace nad rámec názvu a adresy — pokud se tě zájemce zeptá na detail, který neznáš, upřímně řekni, že to zjistíš a ozveš se, nevymýšlej si.",
    "Mluv česky, přátelsky, stručně a věcně. Zároveň aktivně zjišťuj od zájemce: jeho rozpočet, kdy se chce nastěhovat, kolik lidí bude v bytě bydlet, a kontaktní údaje (jméno, telefon nebo e-mail). Jakmile zjistíš alespoň některou z těchto informací, hned zavolej nástroj saveInquiry a ulož ji — i částečně, průběžně, ne až na konci.",
  ].join("\n\n");

  return { property, instructions };
}
