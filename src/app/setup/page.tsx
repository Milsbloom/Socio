import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/setup";
import { SetupForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");
  return (
    <div className="card" style={{ maxWidth: 380, margin: "64px auto" }}>
      <h1>Welcome to Socio</h1>
      <p>Create the owner account. This page only works once.</p>
      <SetupForm />
    </div>
  );
}
