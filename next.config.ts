import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uploaded media can be large videos.
  experimental: { serverActions: { bodySizeLimit: "300mb" } },
};

export default nextConfig;
