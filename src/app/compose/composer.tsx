"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { checkForPlatform, type DraftMedia } from "@/lib/validate";
import { submitPost, type FormState } from "../actions";

export interface ComposerAccount {
  id: number;
  name: string;
  platformLabel: string;
  captionLimit: number;
  maxImages: number;
  requiresMedia: "video" | "any" | null;
}

export default function Composer({ accounts }: { accounts: ComposerAccount[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitPost, {});
  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [media, setMedia] = useState<DraftMedia[]>([]);
  const [mode, setMode] = useState<"now" | "schedule" | "draft">("now");
  const [when, setWhen] = useState("");

  const chosen = accounts.filter((a) => selected.includes(a.id));
  const problems = useMemo(
    () =>
      chosen.flatMap((a) =>
        checkForPlatform({ ...a, label: a.name }, overrides[a.id] ?? caption, media),
      ),
    [chosen, overrides, caption, media],
  );
  const canSubmit = chosen.length > 0 && problems.length === 0 && !pending && (mode !== "schedule" || !!when);

  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <form
      className="card"
      onSubmit={(e) => {
        // Submit manually so an error doesn't wipe the chosen files.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {state.error && <p className="notice error">{state.error}</p>}

      <label htmlFor="caption">Caption</label>
      <textarea id="caption" name="caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
      <p className="muted small">{[...caption].length} characters</p>

      <label htmlFor="media">Images or one video</label>
      <input
        id="media"
        name="media"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
        onChange={(e) =>
          setMedia(
            Array.from(e.target.files ?? []).map((f) => ({ kind: f.type.startsWith("video/") ? "video" : "image" })),
          )
        }
      />

      <label>Post to</label>
      {accounts.map((a) => {
        const on = selected.includes(a.id);
        const text = overrides[a.id] ?? caption;
        const over = [...text].length > a.captionLimit;
        return (
          <div key={a.id} style={{ marginBottom: 8 }}>
            <label className="row" style={{ fontWeight: 400, margin: 0 }}>
              <input type="checkbox" name="account" value={a.id} checked={on} onChange={() => toggle(a.id)} />
              {a.name} <span className="muted small">{a.platformLabel}</span>
              {on && (
                <span className={`small counter ${over ? "over" : "muted"}`}>
                  {[...text].length}/{a.captionLimit}
                </span>
              )}
            </label>
            {on && (
              <details open={a.id in overrides}>
                <summary className="small muted">Different caption for {a.name}</summary>
                <textarea
                  name={a.id in overrides ? `caption_${a.id}` : undefined}
                  value={text}
                  onChange={(e) => setOverrides((o) => ({ ...o, [a.id]: e.target.value }))}
                />
                {a.id in overrides && (
                  <button
                    type="button"
                    className="link small"
                    onClick={() =>
                      setOverrides((o) => {
                        const { [a.id]: _drop, ...rest } = o;
                        return rest;
                      })
                    }
                  >
                    Use the main caption
                  </button>
                )}
              </details>
            )}
          </div>
        );
      })}

      {problems.length > 0 && (
        <ul className="notice error small">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <label>When</label>
      <div className="row">
        {(["now", "schedule", "draft"] as const).map((m) => (
          <label key={m} className="row" style={{ fontWeight: 400, margin: 0 }}>
            <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
            {m === "now" ? "Publish now" : m === "schedule" ? "Schedule" : "Save as draft"}
          </label>
        ))}
      </div>
      {mode === "schedule" && (
        <>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ marginTop: 8 }} />
          <input type="hidden" name="scheduledAtIso" value={when ? new Date(when).toISOString() : ""} />
          <p className="muted small">Your time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
        </>
      )}

      <p>
        <button disabled={!canSubmit}>
          {pending ? "Working..." : mode === "now" ? "Publish" : mode === "schedule" ? "Schedule" : "Save draft"}
        </button>
      </p>
    </form>
  );
}
