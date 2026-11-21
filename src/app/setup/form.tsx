"use client";

import { startTransition, useActionState } from "react";
import { createOwner, type SetupState } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState<SetupState, FormData>(createOwner, {});
  return (
    <>
      {state.error && <p className="notice error">{state.error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
      >
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" />
        <label htmlFor="password">Password (12+ characters)</label>
        <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" />
        <label htmlFor="confirm">Password again</label>
        <input id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" />
        <p>
          <button disabled={pending}>{pending ? "Creating..." : "Create account"}</button>
        </p>
      </form>
    </>
  );
}
