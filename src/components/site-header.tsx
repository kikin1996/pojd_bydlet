import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="text-xl font-semibold text-accent-ink">
          Pojď bydlet
        </Link>
        <Link
          href="/login"
          className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-accent-soft hover:text-accent-ink"
        >
          Přihlásit se
        </Link>
      </div>
    </header>
  );
}
