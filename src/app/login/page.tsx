import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/setup";
import { LoginClient } from "./form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await needsSetup()) redirect("/setup");
  return <LoginClient />;
}
