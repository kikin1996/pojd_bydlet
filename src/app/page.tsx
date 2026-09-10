import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";

const priceFormatter = new Intl.NumberFormat("cs-CZ");

export const revalidate = 60;

function bytCount(n: number) {
  if (n === 1) return "1 byt";
  if (n >= 2 && n <= 4) return `${n} byty`;
  return `${n} bytů`;
}

export default async function HomePage() {
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: "desc" },
  });

  const [hero, ...rest] = properties;
  const listed = hero ? [hero, ...rest] : [];

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-stretch md:grid-cols-2">
            <div className="relative order-2 aspect-[4/3] md:order-1 md:aspect-auto md:min-h-[26rem]">
              {hero?.photos[0] ? (
                <Image
                  src={hero.photos[0]}
                  alt={`Interiér nemovitosti ${hero.name}`}
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  priority
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full bg-accent-soft" />
              )}
            </div>
            <div className="order-1 flex flex-col justify-center gap-6 px-4 py-16 sm:px-8 md:order-2 md:py-0">
              <h1 className="max-w-md font-serif text-5xl leading-[1.05] tracking-tight text-ink sm:text-6xl">
                Najdi svůj další domov
              </h1>
              <p className="max-w-sm text-lg leading-relaxed text-foreground/70">
                Prohlídku vede na dálku náš AI makléř — vidí a slyší byt tak
                jako ty, přímo z tvého telefonu nebo notebooku.
              </p>
              <Link
                href="#byty"
                className="w-fit rounded-md bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                Prohlédnout dostupné byty
              </Link>
            </div>
          </div>
        </section>

        <section id="byty" className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-2xl text-ink">Dostupné byty</h2>
            {listed.length > 0 && (
              <span className="text-sm text-foreground/50">
                {bytCount(listed.length)}
              </span>
            )}
          </div>

          {listed.length === 0 ? (
            <p className="text-foreground/60">
              Momentálně nemáme žádné volné byty.
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {listed.map((property) => (
                <li key={property.id}>
                  <Link
                    href={`/byty/${property.id}`}
                    className="flex items-center gap-4 py-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:gap-6"
                  >
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden bg-accent-soft sm:h-24 sm:w-32">
                      {property.photos[0] ? (
                        <Image
                          src={property.photos[0]}
                          alt={`Interiér nemovitosti ${property.name}`}
                          fill
                          sizes="128px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-serif text-lg text-ink">
                        {property.address}
                      </p>
                      <p className="truncate text-sm text-foreground/60">
                        {property.name}
                      </p>
                    </div>

                    <p className="tabular hidden shrink-0 text-sm text-foreground/50 sm:block">
                      {property.layout}
                      {property.layout && property.size ? " · " : ""}
                      {property.size ? `${property.size} m²` : ""}
                    </p>

                    {property.price ? (
                      <p className="tabular shrink-0 text-right font-serif text-lg text-brass">
                        {priceFormatter.format(property.price)}&nbsp;Kč
                      </p>
                    ) : null}
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
