"use client";

import { useActionState } from "react";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, ROLE_LABEL } from "@/lib/demo";
import { signIn, type LoginState } from "./actions";

export default function LoginForm({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-8">
      {/* Try the demo: one tap per account. Each button submits its own email. */}
      <section aria-labelledby="demo-heading" className="card order-first md:order-last">
        <h2 id="demo-heading" className="mb-1 text-[1.2em] font-bold">
          Try the demo
        </h2>
        <p className="mb-3 text-[0.9em] text-ink-2">
          Tap an account to log in. All demo accounts use the password{" "}
          <b className="whitespace-nowrap text-ink">{DEMO_PASSWORD}</b>
        </p>
        <form action={formAction} className="grid gap-2">
          <input type="hidden" name="password" value={DEMO_PASSWORD} />
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="submit"
              name="email"
              value={a.email}
              disabled={pending}
              className="flex w-full items-center gap-3 rounded-xl border-[1.5px] border-line bg-surface px-3 py-3 text-left hover:border-teal disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{a.label}</span>
                <span className="block text-[0.85em] text-ink-2">
                  {ROLE_LABEL[a.role]} · {a.blurb}
                </span>
              </span>
              <span className="text-[0.8em] text-ink-3">{a.email}</span>
            </button>
          ))}
        </form>
      </section>

      <section aria-labelledby="login-heading">
        <h2 id="login-heading" className="mb-3 text-[1.2em] font-bold">
          Log in with email
        </h2>
        <form action={formAction} className="grid gap-3" noValidate>
          <label className="grid gap-1">
            <span className="text-[0.9em] font-bold">Email</span>
            <input
              className="field"
              type="email"
              name="email"
              autoComplete="username"
              defaultValue={state.email}
              required
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[0.9em] font-bold">Password</span>
            <input className="field" type="password" name="password" autoComplete="current-password" required />
          </label>
          <button type="submit" className="btn btn-primary mt-1" disabled={pending}>
            {pending ? "Logging in…" : "Log in"}
          </button>
        </form>

        <div aria-live="polite" className="mt-3">
          {state.error && (
            <p className="note note-bad" role="alert">
              {state.error}
            </p>
          )}
          {!configured && !state.error && (
            <p className="note note-warn">
              <b>Not connected yet.</b> This copy of the site has no database settings, so logging in won&apos;t work.
            </p>
          )}
        </div>

        <p className="mt-4 text-[0.85em] text-ink-2">
          New accounts can&apos;t be created here. This is a demo with sample data only, so please use a demo
          account.
        </p>
      </section>
    </div>
  );
}
