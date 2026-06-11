import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: join(__dir, "../.."),
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
    return [
      { source: "/api-backend/:path*", destination: `${api}/:path*` },
    ];
  },
};

export default nextConfig;
