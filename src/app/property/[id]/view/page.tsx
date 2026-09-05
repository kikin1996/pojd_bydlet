import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ViewerRoom } from "./viewer-room";

export default async function PropertyViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const property = await prisma.property.findUnique({ where: { id } });
  if (!property || property.ownerId !== session!.user!.id) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <Link
        href={`/dashboard/properties/${property.id}`}
        className="text-sm text-gray-500 hover:underline"
      >
        &larr; Zpět na detail nemovitosti
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{property.name}</h1>
        <p className="text-gray-500">{property.address}</p>
      </div>

      <ViewerRoom propertyId={property.id} />
    </main>
  );
}
