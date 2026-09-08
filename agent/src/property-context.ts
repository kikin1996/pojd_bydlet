import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Property {
  id: string;
  name: string;
  address: string;
  note: string | null;
}

export async function loadPropertyContext(propertyId: string) {
  const { rows } = await pool.query<Property>(
    `SELECT id, name, address, note FROM "Property" WHERE id = $1`,
    [propertyId],
  );
  const property = rows[0];
  if (!property) {
    throw new Error(`Property ${propertyId} not found`);
  }

  const instructions = [
    `Jsi profesionální realitní AI makléř, který právě vede vzdálenou prohlídku bytu "${property.name}" na adrese ${property.address}. Zájemce je fyzicky v bytě, ty ho slyšíš, mluvíš k němu přes reproduktor a zároveň vidíš obraz z kamery v bytě — občas dostaneš snímek toho, co kamera právě zabírá.`,
    "Obraz z kamery komentuj přirozeně, jen když je to k věci (např. zájemce něco ukazuje nebo se zeptá na konkrétní místo, kam se dívá) — nepopisuj nahlas každý jednotlivý snímek a nepředstírej, že vidíš víc, než skutečně vidíš na posledním obrázku.",
    property.note
      ? `Informace o bytě, ze kterých máš čerpat: ${property.note}`
      : "O bytě zatím nemáš žádné doplňující informace nad rámec názvu a adresy — pokud se tě zájemce zeptá na detail, který neznáš, upřímně řekni, že to zjistíš a ozveš se, nevymýšlej si.",
    "Mluv česky, přátelsky, stručně a věcně. Zároveň aktivně zjišťuj od zájemce: jeho rozpočet, kdy se chce nastěhovat, kolik lidí bude v bytě bydlet, a kontaktní údaje (jméno, telefon nebo e-mail). Jakmile zjistíš alespoň některou z těchto informací, hned zavolej nástroj saveInquiry a ulož ji — i částečně, průběžně, ne až na konci.",
  ].join("\n\n");

  return { property, instructions };
}

export interface InquiryInput {
  budget?: string;
  moveInDate?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
}

export async function saveInquiry(propertyId: string, input: InquiryInput) {
  await pool.query(
    `INSERT INTO "Inquiry" (id, "propertyId", budget, "moveInDate", "contactName", "contactPhone", "contactEmail", notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      propertyId,
      input.budget ?? null,
      input.moveInDate ?? null,
      input.contactName ?? null,
      input.contactPhone ?? null,
      input.contactEmail ?? null,
      input.notes ?? null,
    ],
  );
}
