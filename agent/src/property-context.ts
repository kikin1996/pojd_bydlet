import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Property {
  id: string;
  name: string;
  address: string;
  note: string | null;
  agentInstructions: string | null;
}

export async function loadPropertyContext(propertyId: string) {
  const { rows } = await pool.query<Property>(
    `SELECT id, name, address, note, "agentInstructions" FROM "Property" WHERE id = $1`,
    [propertyId],
  );
  const property = rows[0];
  if (!property) {
    throw new Error(`Property ${propertyId} not found`);
  }

  const { rows: deviceRows } = await pool.query<{ room: string }>(
    `SELECT room FROM "Device" WHERE "propertyId" = $1 ORDER BY "createdAt" ASC`,
    [propertyId],
  );
  const rooms = deviceRows.map((d) => d.room);

  const documents = await loadPropertyDocuments(propertyId);

  const instructions = [
    `Jsi profesionální realitní AI makléř, který právě vede vzdálenou prohlídku bytu "${property.name}" na adrese ${property.address}. Zájemce je fyzicky v bytě, ty ho slyšíš, mluvíš k němu přes reproduktory v jednotlivých místnostech a zároveň vidíš obraz z kamer v bytě — byt může mít kameru ve víc místnostech, takže občas dostaneš snímky z jedné i dvou místností najednou, vždy popsané, ze které místnosti jsou (např. "Kamera: Ložnice").`,
    rooms.length > 0
      ? `Byt má kamery v těchto místnostech: ${rooms.join(", ")}. Automaticky ti chodí obraz z míst, kde je zrovna pohyb, ale pokud potřebuješ vidět konkrétní místnost i bez pohybu (např. se zájemce zeptá na kuchyň, zatímco stojí v obýváku), zavolej nástroj switchCamera s přesným názvem té místnosti.`
      : "Byt zatím nemá připojenou žádnou kameru.",
    "Obraz z kamer komentuj přirozeně, jen když je to k věci (např. zájemce něco ukazuje nebo se zeptá na konkrétní místo, kam se dívá) — nepopisuj nahlas každý jednotlivý snímek a nepředstírej, že vidíš víc, než skutečně vidíš na posledních snímcích. Pokud najednou nevidíš žádný obrázek z místnosti, kde je podle rozhovoru zájemce, klidně se zeptej, jestli je v pořádku, ale nevymýšlej si, co tam vidíš.",
    property.agentInstructions
      ? `Interní pokyny od makléře pro tuto prohlídku (návštěvník je nevidí, řiď se jimi): ${property.agentInstructions}`
      : null,
    property.note
      ? `Informace o bytě, ze kterých máš čerpat: ${property.note}`
      : "O bytě zatím nemáš žádné doplňující informace nad rámec názvu a adresy — pokud se tě zájemce zeptá na detail, který neznáš, upřímně řekni, že to zjistíš a ozveš se, nevymýšlej si.",
    documents.length > 0
      ? `K bytu je nahráno ${documents.length} dokument(ů) (např. smlouva, energetický štítek, pravidla domu). Pokud se zájemce zeptá na něco, co by mohlo být v oficiálním dokumentu (kauce, pravidla pro zvířata, poplatky...), zavolej nástroj searchPropertyDocuments místo hádání.`
      : "K bytu zatím nejsou nahrané žádné dokumenty.",
    "Mluv česky, přátelsky, stručně a věcně. Zároveň aktivně zjišťuj od zájemce: jeho rozpočet, kdy se chce nastěhovat, kolik lidí bude v bytě bydlet, a kontaktní údaje (jméno, telefon nebo e-mail). Jakmile zjistíš alespoň některou z těchto informací, hned zavolej nástroj saveInquiry a ulož ji — i částečně, průběžně, ne až na konci.",
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");

  return { property, rooms, documents, instructions };
}

export interface PropertyDocumentSummary {
  title: string;
  content: string;
}

export async function loadPropertyDocuments(propertyId: string): Promise<PropertyDocumentSummary[]> {
  const { rows } = await pool.query<PropertyDocumentSummary>(
    `SELECT title, content FROM "PropertyDocument" WHERE "propertyId" = $1`,
    [propertyId],
  );
  return rows;
}

// Simple keyword search over paragraph-sized chunks — good enough for the
// handful of documents a single property has, without needing an embeddings
// pipeline. Only the matched snippets (not whole documents) go to the model.
export function searchDocuments(documents: PropertyDocumentSummary[], query: string, maxResults = 3): string {
  if (documents.length === 0) return "K bytu zatím nejsou nahrané žádné dokumenty.";

  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (queryWords.length === 0) return "Zadej konkrétnější dotaz.";

  const matches: { title: string; text: string; score: number }[] = [];
  for (const doc of documents) {
    const paragraphs = doc.content.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    for (const paragraph of paragraphs) {
      const lower = paragraph.toLowerCase();
      const score = queryWords.reduce((sum, w) => sum + (lower.includes(w) ? 1 : 0), 0);
      if (score > 0) matches.push({ title: doc.title, text: paragraph.trim().slice(0, 600), score });
    }
  }

  if (matches.length === 0) return "V nahraných dokumentech jsem k tomuto dotazu nic nenašel.";

  matches.sort((a, b) => b.score - a.score);
  return matches
    .slice(0, maxResults)
    .map((m) => `Z dokumentu "${m.title}":\n${m.text}`)
    .join("\n\n---\n\n");
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
