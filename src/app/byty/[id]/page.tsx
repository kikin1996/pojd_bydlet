import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { BookingForm } from "./booking-form";

const priceFormatter = new Intl.NumberFormat("cs-CZ");

export default async function PropertyPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id } });

  if (!property) {
    notFound();
  }

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <Link href="/" className="text-sm text-foreground/60 hover:text-accent-ink">
          &larr; Zpět na nabídku bytů
        </Link>

        {property.photos.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="relative aspect-[4/3] overflow-hidden bg-accent-soft sm:col-span-2 sm:aspect-auto sm:h-full">
              <Image
                src={property.photos[0]}
                alt={`Interiér nemovitosti ${property.name}`}
                fill
                sizes="(min-width: 640px) 66vw, 100vw"
                priority
                className="object-cover"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
              {property.photos.slice(1, 3).map((photo, index) => (
                <div
                  key={photo}
                  className="relative aspect-[4/3] overflow-hidden bg-accent-soft"
                >
                  <Image
                    src={photo}
                    alt={`Další pohled na nemovitost ${property.name}, fotka ${index + 2}`}
                    fill
                    sizes="33vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h1 className="font-serif text-3xl text-ink">{property.address}</h1>
            <p className="mt-1 text-foreground/60">{property.name}</p>

            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {property.layout && (
                <div className="flex gap-1">
                  <dt className="text-foreground/50">Dispozice</dt>
                  <dd className="tabular font-medium text-foreground">{property.layout}</dd>
                </div>
              )}
              {property.size && (
                <div className="flex gap-1">
                  <dt className="text-foreground/50">Plocha</dt>
                  <dd className="tabular font-medium text-foreground">{property.size}&nbsp;m²</dd>
                </div>
              )}
              {property.price && (
                <div className="flex gap-1">
                  <dt className="text-foreground/50">Nájem</dt>
                  <dd className="tabular font-medium text-brass">
                    {priceFormatter.format(property.price)}&nbsp;Kč/měsíc
                  </dd>
                </div>
              )}
            </dl>

            {property.note && (
              <p className="mt-6 whitespace-pre-line text-foreground/80">{property.note}</p>
            )}
          </div>

          <div className="border-t-2 border-brass bg-surface p-6 shadow-sm">
            <h2 className="font-serif text-lg text-ink">Rezervovat prohlídku</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Prohlídku vede na dálku náš AI makléř — stačí dorazit na adresu ve zvolený
              čas.
            </p>
            <div className="mt-4">
              <BookingForm propertyId={property.id} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
