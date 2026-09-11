import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDeviceOnline } from "@/lib/device-status";
import { addRoomDeviceAction } from "../../actions";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const property = await prisma.property.findUnique({
    where: { id },
    include: { devices: { orderBy: { createdAt: "asc" } } },
  });

  if (!property || property.ownerId !== session!.user!.id) {
    notFound();
  }

  const inquiries = await prisma.inquiry.findMany({
    where: { propertyId: property.id },
    orderBy: { createdAt: "desc" },
  });

  const bookings = await prisma.booking.findMany({
    where: { propertyId: property.id },
    orderBy: { preferredAt: "asc" },
  });

  const headersList = await headers();
  const origin = `${headersList.get("x-forwarded-proto") ?? "http"}://${headersList.get("host")}`;
  const addRoomForThisProperty = addRoomDeviceAction.bind(null, property.id);

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
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Zařízení po místnostech ({property.devices.length})
        </h2>

        <ul className="flex flex-col gap-3">
          {property.devices.map((device) => {
            const online = isDeviceOnline(device.lastSeenAt);
            const kioskUrl = `${origin}/kiosk/${device.pairingCode}`;
            return (
              <li
                key={device.id}
                className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">{device.room}</p>
                  <span
                    className={`flex items-center gap-1.5 text-xs font-medium ${
                      online ? "text-green-600" : "text-gray-400"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        online ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                    {online ? "Online" : "Offline"}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Otevři tento odkaz na zařízení v dané místnosti (tablet/telefon s
                  kamerou a mikrofonem):
                </p>
                <code className="mt-1 block break-all rounded-md bg-white px-3 py-2 text-sm text-gray-800">
                  {kioskUrl}
                </code>
              </li>
            );
          })}
        </ul>

        <form
          action={addRoomForThisProperty}
          className="mt-4 flex gap-2 border-t border-gray-200 pt-4"
        >
          <input
            name="room"
            placeholder="Název místnosti (např. Ložnice)"
            required
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Přidat místnost
          </button>
        </form>
      </section>

      <Link
        href={`/property/${property.id}/view`}
        className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Zobrazit živý přenos
      </Link>

      <section className="rounded-lg border border-gray-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Rezervace prohlídek ({bookings.length})
        </h2>

        {bookings.length === 0 ? (
          <p className="text-sm text-gray-500">
            Zatím žádné rezervace — objeví se tu, jakmile si někdo na veřejné stránce
            bytu rezervuje prohlídku.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {bookings.map((booking) => (
              <li
                key={booking.id}
                className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <p className="text-sm font-medium text-gray-900">
                  {new Intl.DateTimeFormat("cs-CZ", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(booking.preferredAt)}
                </p>
                <dl className="mt-1 flex flex-col gap-0.5">
                  <div className="flex gap-2 text-sm">
                    <dt className="font-medium text-gray-700">Jméno:</dt>
                    <dd className="text-gray-600">{booking.name}</dd>
                  </div>
                  {booking.email && (
                    <div className="flex gap-2 text-sm">
                      <dt className="font-medium text-gray-700">E-mail:</dt>
                      <dd className="text-gray-600">{booking.email}</dd>
                    </div>
                  )}
                  {booking.phone && (
                    <div className="flex gap-2 text-sm">
                      <dt className="font-medium text-gray-700">Telefon:</dt>
                      <dd className="text-gray-600">{booking.phone}</dd>
                    </div>
                  )}
                  {booking.message && (
                    <div className="flex gap-2 text-sm">
                      <dt className="font-medium text-gray-700">Zpráva:</dt>
                      <dd className="text-gray-600">{booking.message}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Poptávky od zájemců ({inquiries.length})
        </h2>

        {inquiries.length === 0 ? (
          <p className="text-sm text-gray-500">
            Zatím žádné poptávky — objeví se tu, jakmile AI makléř při prohlídce
            zjistí od zájemce rozpočet, termín nastěhování nebo kontakt.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {inquiries.map((inquiry) => {
              const fields: { label: string; value: string }[] = [];
              if (inquiry.budget) fields.push({ label: "Rozpočet", value: inquiry.budget });
              if (inquiry.moveInDate) {
                fields.push({ label: "Termín nastěhování", value: inquiry.moveInDate });
              }
              if (inquiry.contactName) {
                fields.push({ label: "Jméno", value: inquiry.contactName });
              }
              if (inquiry.contactPhone) {
                fields.push({ label: "Telefon", value: inquiry.contactPhone });
              }
              if (inquiry.contactEmail) {
                fields.push({ label: "E-mail", value: inquiry.contactEmail });
              }
              if (inquiry.notes) fields.push({ label: "Poznámka", value: inquiry.notes });

              return (
                <li
                  key={inquiry.id}
                  className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <p className="mb-1 text-xs text-gray-400">
                    {new Intl.DateTimeFormat("cs-CZ", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(inquiry.createdAt)}
                  </p>
                  <dl className="flex flex-col gap-0.5">
                    {fields.map((field) => (
                      <div key={field.label} className="flex gap-2 text-sm">
                        <dt className="font-medium text-gray-700">{field.label}:</dt>
                        <dd className="text-gray-600">{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
