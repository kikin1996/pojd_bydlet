import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";

const priceFormatter = new Intl.NumberFormat("cs-CZ");

export const revalidate = 60;

export default async function HomePage() {
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h1 className="max-w-2xl text-4xl font-semibold text-foreground sm:text-5xl">
            Najdi svůj další domov
          </h1>
          <p className="mt-4 max-w-xl text-lg text-foreground/70">
            Prohlídku si domluvíš na pár kliknutí a náš AI makléř tě jí provede na
            dálku — nemusíš se s nikým sejít osobně.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          {properties.length === 0 ? (
            <p className="text-foreground/60">Momentálně nemáme žádné volné byty.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {properties.map((property) => (
                <li key={property.id}>
                  <Link
                    href={`/byty/${property.id}`}
                    className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:border-accent"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-accent-soft">
                      {property.photos[0] ? (
                        <Image
                          src={property.photos[0]}
                          alt={`Interiér nemovitosti ${property.name}`}
                          fill
                          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                          className="object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-4">
                      <h2 className="truncate text-lg font-semibold text-foreground">
                        {property.name}
                      </h2>
                      <p className="truncate text-sm text-foreground/60">
                        {property.address}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-foreground/70">
                          {property.layout}
                          {property.layout && property.size ? " · " : ""}
                          {property.size ? `${property.size} m²` : ""}
                        </span>
                        {property.price ? (
                          <span className="shrink-0 font-semibold text-accent-ink">
                            {priceFormatter.format(property.price)}&nbsp;Kč/měsíc
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
