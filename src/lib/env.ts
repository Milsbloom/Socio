/** Read a required environment variable, failing loudly when it is missing. */
export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function appUrl(): string {
  return env("APP_URL").replace(/\/+$/, "");
}

export function callbackUrl(platform: string): string {
  return `${appUrl()}/api/connect/${platform}/callback`;
}

/** Cookies are marked Secure whenever the app is served over https. */
export function secureCookies(): boolean {
  return (process.env.APP_URL ?? "").startsWith("https://");
}
