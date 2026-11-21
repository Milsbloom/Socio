// Runs once when the server starts: brings the database up to date, so a deploy needs no shell step.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migrateOnStart } = await import("./instrumentation-node");
    await migrateOnStart();
  }
}
