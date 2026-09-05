# Pojď bydlet

Webová platforma pro dálkové prohlídky nemovitostí: přihlášení, správa nemovitostí a živý přenos obrazu+zvuku z bytu (kamera, mikrofon, reproduktor) do prohlížeče makléře. V další fázi se do stejné místnosti připojí AI hlasový agent, který povede prohlídku sám.

## Tech stack

- Next.js 16 (App Router, TypeScript, Tailwind)
- Auth.js (Credentials provider, JWT session)
- Prisma + SQLite (lokální vývoj)
- LiveKit (WebRTC video/audio místnosti, připraveno na budoucí AI agenty)

## Nastavení

1. Nainstaluj závislosti:

   ```bash
   npm install
   ```

2. Zkopíruj `.env.example` do `.env` a vyplň:
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

## Struktura

- `src/app/dashboard` — přehled a správa nemovitostí (chráněno přihlášením)
- `src/app/property/[id]/view` — viewer stránka makléře (živý přenos)
- `src/app/kiosk/[pairingCode]` — stránka pro zařízení v bytě (kamera+mikrofon)
- `src/app/api/livekit/token` — generování LiveKit access tokenů
- `src/app/api/devices/heartbeat` — aktualizace online/offline stavu zařízení
- `prisma/schema.prisma` — datový model (User, Property, Device)
