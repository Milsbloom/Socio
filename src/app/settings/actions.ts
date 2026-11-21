"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { issueApiKey, revokeApiKey } from "@/lib/oauth";

export type KeyState = { key?: string; error?: string };

export async function createKey(_: KeyState, form: FormData): Promise<KeyState> {
  const { uid } = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the key a name, such as the app that will use it." };
  const key = await issueApiKey(uid, name);
  revalidatePath("/settings");
  return { key };
}

export async function revokeKey(form: FormData) {
  const { uid } = await requireUser();
  await revokeApiKey(uid, Number(form.get("id")));
  revalidatePath("/settings");
}
