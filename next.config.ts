import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uploaded media can be large videos.
  experimental: { serverActions: { bodySizeLimit: "300mb" } },
  // The hosting account has other lockfiles higher up; this folder is the project root.
  outputFileTracingRoot: __dirname,
  // Migrations run at startup, so the SQL files must ship with the server build.
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
};

export default nextConfig;
