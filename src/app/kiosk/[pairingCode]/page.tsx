import { KioskRoom } from "./kiosk-room";

export default async function KioskPage({
  params,
}: {
  params: Promise<{ pairingCode: string }>;
}) {
  const { pairingCode } = await params;
  return <KioskRoom pairingCode={pairingCode} />;
}
