import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDeviceOnline } from "@/lib/device-status";
import { createPropertyAction, logoutAction } from "./actions";

export default async function DashboardPage() {
  const session = await auth();

  const properties = await prisma.property.findMany({
    where: { ownerId: session!.user!.id },
    include: { devices: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Nemovitosti</h1>
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-sm text-gray-500 underline hover:text-gray-800"
          >
            Odhlásit se
          </button>
        </form>
      </div>

      <section className="flex flex-col gap-3">
        {properties.length === 0 && (
          <p className="text-sm text-gray-500">
            Zatím žádné nemovitosti. Přidej první níže.
          </p>
        )}

        {properties.map((property) => {
          const online = property.devices.some((device) =>
            isDeviceOnline(device.lastSeenAt),
          );
          return (
            <Link
              key={property.id}
              href={`/dashboard/properties/${property.id}`}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:border-gray-400"
            >
              <div>
                <p className="font-medium text-gray-900">{property.name}</p>
                <p className="text-sm text-gray-500">{property.address}</p>
              </div>
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
            </Link>
          );
        })}
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Přidat nemovitost
        </h2>
        <form action={createPropertyAction} className="flex flex-col gap-3">
          <input
            name="name"
            placeholder="Název (např. Byt Vinohrady 2+kk)"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
          <input
            name="address"
            placeholder="Adresa"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
          <div className="grid grid-cols-3 gap-3">
            <input
              name="layout"
              placeholder="Dispozice (2+kk)"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
            <input
              name="size"
              type="number"
              inputMode="numeric"
              placeholder="Plocha (m²)"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
            <input
              name="price"
              type="number"
              inputMode="numeric"
              placeholder="Nájem (Kč/měsíc)"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          <textarea
            name="note"
            placeholder="Popis bytu — vidí ho zájemci na webu a čerpá z něj i AI makléř (volitelné)"
            rows={3}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
          <button
            type="submit"
            className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Přidat
          </button>
        </form>
      </section>
    </main>
  );
}
