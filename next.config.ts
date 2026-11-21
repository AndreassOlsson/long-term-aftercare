import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Pictures are shrunk in the browser before upload; this leaves room for
    // three of them. Vercel itself caps a request at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
