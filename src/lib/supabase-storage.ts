import { createClient } from "@supabase/supabase-js";

const BUCKET = "property-documents";

// Service-role client: bypasses RLS, so this must only ever be imported from
// server-side code (Server Actions, route handlers) — never from a Client Component.
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function uploadPropertyDocument(propertyId: string, file: File): Promise<string> {
  const path = `${propertyId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(`Nahrání dokumentu selhalo: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
