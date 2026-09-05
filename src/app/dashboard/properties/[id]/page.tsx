import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDeviceOnline } from "@/lib/device-status";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const property = await prisma.property.findUnique({
    where: { id },
    include: { device: true },
  });

  if (!property || property.ownerId !== session!.user!.id) {
    notFound();
  }

  const headersList = await headers();
  const origin = `${headersList.get("x-forwarded-proto") ?? "http"}://${headersList.get("host")}`;
  const kioskUrl = property.device
    ? `${origin}/kiosk/${property.device.pairingCode}`
    : null;
  const online = isDeviceOnline(property.device?.lastSeenAt ?? null);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:underline">
        &larr; Zpět na nemovitosti
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{property.name}</h1>
        <p className="text-gray-500">{property.address}</p>
        {property.note && <p className="mt-2 text-sm text-gray-600">{property.note}</p>}
      </div>

      <section className="rounded-lg border border-gray-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Zařízení v bytě</h2>
          <span
            className={`flex items-center gap-1.5 text-xs font-medium ${
              online ? "text-green-600" : "text-gray-400"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-gray-300"}`} />
            {online ? "Online" : "Offline"}
          </span>
        </div>

        {kioskUrl && (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-gray-600">
              Otevři tento odkaz na zařízení v bytě (tablet, notebook s kamerou a
              mikrofonem):
            </p>
            <code className="break-all rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-800">
              {kioskUrl}
            </code>
          </div>
        )}
      </section>

      <Link
        href={`/property/${property.id}/view`}
        className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Zobrazit živý přenos
      </Link>
    </main>
  );
}
