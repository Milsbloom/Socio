"use server";

import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { startSession } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { needsSetup, ownerEmail } from "@/lib/setup";

export type SetupState = { error?: string };

export async function createOwner(_: SetupState, form: FormData): Promise<SetupState> {
  if (!(await needsSetup())) redirect("/login");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!ownerEmail() || email !== ownerEmail()) return { error: "Use the owner email set in the hosting settings (OWNER_EMAIL)." };
  if (password.length < 12) return { error: "Use a password of at least 12 characters." };
  if (password !== String(form.get("confirm") ?? "")) return { error: "The passwords don't match." };
  const [row] = await db.insert(schema.users).values({ email, passwordHash: await hashPassword(password) });
  await startSession(row.insertId);
  redirect("/accounts");
}
