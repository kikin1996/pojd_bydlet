import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <Link href="/" className="text-2xl font-semibold text-accent-ink">
        Pojď bydlet
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <h1 className="mb-5 text-lg font-semibold text-foreground">
          Přihlášení pro makléře
        </h1>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
