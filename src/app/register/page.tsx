import Link from "next/link";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <Link href="/" className="font-serif text-2xl tracking-tight text-ink">
        Pojď bydlet
      </Link>
      <div className="w-full max-w-sm border-t-2 border-brass bg-surface p-6 shadow-sm">
        <h1 className="mb-1 font-serif text-2xl text-ink">Založit účet makléře</h1>
        <p className="mb-6 text-sm text-foreground/60">
          Spravuj vlastní nabídku bytů a nech AI makléře vést prohlídky za tebe.
        </p>
        <RegisterForm />
      </div>
      <p className="text-sm text-foreground/60">
        Už máš účet?{" "}
        <Link
          href="/login"
          className="font-medium text-accent-ink underline-offset-2 hover:underline"
        >
          Přihlas se
        </Link>
      </p>
    </main>
  );
}
