import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="font-serif text-xl tracking-tight text-ink">
          Pojď bydlet
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/register"
            className="rounded-md px-3 py-2 text-sm text-foreground/70 hover:bg-accent-soft hover:text-accent-ink"
          >
            Registrace
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent-ink"
          >
            Přihlásit se
          </Link>
        </nav>
      </div>
    </header>
  );
}
