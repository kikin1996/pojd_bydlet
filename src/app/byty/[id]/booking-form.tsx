"use client";

import { useActionState } from "react";
import { createBookingAction, type BookingFormState } from "./actions";

const initialState: BookingFormState = { status: "idle" };

export function BookingForm({ propertyId }: { propertyId: string }) {
  const boundAction = createBookingAction.bind(null, propertyId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (state.status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm text-accent-ink"
      >
        {state.message}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-foreground">
          Jméno
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="phone" className="text-sm font-medium text-foreground">
            Telefon
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="preferredAt" className="text-sm font-medium text-foreground">
          Preferovaný termín prohlídky
        </label>
        <input
          id="preferredAt"
          name="preferredAt"
          type="datetime-local"
          required
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="message" className="text-sm font-medium text-foreground">
          Zpráva (volitelné)
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          placeholder="Např. kolik vás bude bydlet, kdy se chcete nastěhovat…"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Odesílám…" : "Rezervovat prohlídku"}
      </button>
    </form>
  );
}
