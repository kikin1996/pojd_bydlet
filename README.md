# Pojď bydlet

Webová platforma pro dálkové prohlídky nemovitostí: přihlášení, správa nemovitostí a živý přenos obrazu+zvuku z bytu (kamera, mikrofon, reproduktor) do prohlížeče makléře. Do stejné LiveKit místnosti se navíc připojuje AI hlasový agent (`agent/`), který slyší zájemce, odpovídá na dotazy o bytě a ukládá zjištěné poptávky.

## Tech stack

- Next.js 16 (App Router, TypeScript, Tailwind)
- Auth.js (Credentials provider, JWT session)
- Prisma + PostgreSQL ([Supabase](https://supabase.com); Neon nebo InsForge fungují stejně dobře)
- LiveKit (WebRTC video/audio místnosti, připraveno na budoucí AI agenty)

## Nastavení

1. Nainstaluj závislosti:

   ```bash
   npm install
   ```

2. Zkopíruj `.env.example` do `.env` a vyplň:
   - `DATABASE_URL` — connection string k PostgreSQL databázi (např. z [Supabase](https://supabase.com), Neon nebo InsForge). U Supabase použij **pooler** connection string (`aws-0-<region>.pooler.supabase.com`), přímé připojení (`db.<ref>.supabase.co`) vyžaduje IPv6 a z běžné sítě/CI nemusí být dostupné.
   - `AUTH_SECRET` — vygeneruj: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — přihlašovací údaje prvního admina
   - `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL` — zdarma na [cloud.livekit.io](https://cloud.livekit.io) (bez nich se přenos obrazu/zvuku nepřipojí, zbytek appky funguje)

3. Připrav databázi a vytvoř admin uživatele:

   ```bash
   npx prisma migrate dev
   npm run db:seed
   ```

4. Spusť dev server:

   ```bash
   npm run dev
   ```

## Jak to vyzkoušet

1. Otevři [http://localhost:3000](http://localhost:3000), přihlas se (`ADMIN_EMAIL`/`ADMIN_PASSWORD`).
2. V dashboardu přidej nemovitost — vygeneruje se párovací odkaz na kiosk stránku.
3. Otevři párovací odkaz (`/kiosk/<kód>`) na libovolném zařízení s kamerou a mikrofonem (klidně jiná záložka/telefon ve stejné síti) a povol přístup ke kameře/mikrofonu — to simuluje zařízení v bytě.
4. V detailu nemovitosti klikni na „Zobrazit živý přenos“ — uvidíš obraz a uslyšíš zvuk z kiosk zařízení, můžeš zapnout mikrofon a mluvit zpět.
5. Stav zařízení (online/offline) se v dashboardu aktualizuje podle heartbeatu z kiosk stránky.

## Nasazení (Vercel)

`prisma generate` se spouští automaticky přes `postinstall` skript, takže build na Vercelu funguje bez dalšího nastavení. Je ale potřeba v nastavení projektu na Vercelu (Settings → Environment Variables) vyplnit stejné proměnné jako v `.env`: `DATABASE_URL`, `AUTH_SECRET`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`. Databázová migrace (`npx prisma migrate deploy`) a seed admina se spouští ručně z lokálního stroje proti produkční `DATABASE_URL` — nejsou součástí Vercel buildu.

## AI hlasový agent (`agent/`)

Samostatný Node.js projekt (jiné závislosti/runtime než hlavní appka — [LiveKit Agents](https://docs.livekit.io/agents/) + OpenAI Realtime API), přistupuje k databázi přímo přes `pg` (ne přes Prisma — viz "Nasazení" níže, proč). Když se bytové zařízení připojí ke kiosk stránce, token, který appka vydá, nese `roomConfig` s dispatchem agenta — LiveKit ho spustí, jakmile se místnost poprvé vytvoří. Agent zná konkrétní nemovitost (název, adresu, poznámku z `Property.note`), **vidí obraz z kamery** (viz níže) a umí zjištěné poptávky (rozpočet, termín nastěhování, kontakt) ukládat do tabulky `Inquiry`.

### Lokální vývoj

1. `cd agent && npm install`
2. Zkopíruj `agent/.env.example` do `agent/.env` a vyplň `DATABASE_URL` (stejná jako v kořenovém `.env`), `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`/`LIVEKIT_URL` (stejné jako v kořenovém `.env`) a `OPENAI_API_KEY` (z [platform.openai.com](https://platform.openai.com), vyžaduje nastavený billing — Realtime API není zdarma)
3. `npm run dev` — worker se zaregistruje k LiveKit projektu a čeká na joby

### Nasazení (LiveKit Cloud)

Agent běží natrvalo na LiveKit Cloud (zdarma v rámci free tier — 1000 minut/měsíc), ne na žádném vlastním serveru:

1. Nainstaluj [LiveKit CLI](https://docs.livekit.io/reference/developer-tools/livekit-cli/) (`winget install LiveKit.LiveKitCLI` na Windows) a přihlas se: `lk cloud auth` (nebo `lk project add <jméno> --url ... --api-key ... --api-secret ...` bez prohlížeče)
2. V `agent/` vytvoř `agent-secrets.env` s `OPENAI_API_KEY` a `DATABASE_URL` (nekomituje se, je v `.gitignore`)
3. `lk agent create --secrets-file agent-secrets.env --region eu-central` — vygeneruje `Dockerfile`/`.dockerignore` (už upravené pro npm+tsx, ne pnpm+tsc) a `livekit.toml` (ten se commituje, obsahuje jen ID, ne tajné hodnoty)
4. Další nasazení stejného agenta: `lk agent deploy`. Aktualizace secrets: `lk agent update-secrets --secrets-file agent-secrets.env --overwrite`. Logy: `lk agent logs`. Stav: `lk agent status`

Poznámky:
- Databázi zpracovává přímo přes `pg` (raw SQL), ne přes Prisma — Docker build kontext je jen `agent/`, takže by nedosáhl na sdílený generovaný Prisma klient v kořenovém `src/generated/prisma`.
- Node.js verze `@livekit/agents` zatím nemá vestavěné vzorkování video snímků (na rozdíl od Python SDK) — `agent/src/index.ts` proto snímek z kamery ručně vzorkuje a posílá do konverzace přes `agent.updateChatCtx()` každé 3 s.
- Testuješ-li mikrofon i reproduktor na stejném zařízení, používej sluchátka — jinak hrozí zpětnovazební smyčka (AI slyší sama sebe).
- Region computu (`eu-central`) může být jiný než region observability projektu (recordings/transcripts) — `lk agent create` na to upozorní, pokud jde o problém pro GDPR, řeší se založením projektu s EU observability regionem.

## Struktura

- `src/app/dashboard` — přehled a správa nemovitostí (chráněno přihlášením)
- `src/app/property/[id]/view` — viewer stránka makléře (živý přenos)
- `src/app/kiosk/[pairingCode]` — stránka pro zařízení v bytě (kamera+mikrofon)
- `src/app/api/livekit/token` — generování LiveKit access tokenů + dispatch AI agenta
- `src/app/api/devices/heartbeat` — aktualizace online/offline stavu zařízení
- `prisma/schema.prisma` — datový model (User, Property, Device, Inquiry)
- `agent/` — AI hlasový agent (LiveKit Agents + OpenAI Realtime API)
