"use client";

import { startTransition, useActionState } from "react";
import { login, type FormState } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <div className="card" style={{ maxWidth: 380, margin: "64px auto" }}>
      <h1>Sign in to Socio</h1>
      {state.error && <p className="notice error">{state.error}</p>}
      <form
        onSubmit={(e) => {
          // Submit manually so a failed attempt doesn't clear the email field.
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
      >
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" />
        <p>
          <button disabled={pending}>{pending ? "Signing in..." : "Sign in"}</button>
        </p>
      </form>
    </div>
  );
}
