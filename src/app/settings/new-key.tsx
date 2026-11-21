"use client";

import { startTransition, useActionState } from "react";
import { createKey, type KeyState } from "./actions";

export function NewKeyForm() {
  const [state, action, pending] = useActionState<KeyState, FormData>(createKey, {});
  return (
    <>
      {state.error && <p className="notice error">{state.error}</p>}
      {state.key && (
        <div className="notice ok">
          <p>Copy this key now. Socio won't show it again.</p>
          <code style={{ wordBreak: "break-all" }}>{state.key}</code>
        </div>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
      >
        <input type="text" name="name" placeholder="Key name, e.g. ChatGPT or Zapier" style={{ flex: 1, minWidth: 200 }} />
        <button disabled={pending}>{pending ? "Creating..." : "Create API key"}</button>
      </form>
    </>
  );
}
