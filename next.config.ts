import type { NextConfig } from "next";

const previewHost = process.env.E2B_SANDBOX_ID
  ? `3000-${process.env.E2B_SANDBOX_ID}.e2b.app`
  : undefined;

const nextConfig: NextConfig = {
  // Arena's HTTPS preview is a different origin from the internal dev server.
  // Allow only this sandbox's generated host so hydration and form handlers work.
  allowedDevOrigins: previewHost ? [previewHost] : [],
  serverExternalPackages: ["better-sqlite3", "sharp"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "media.pollinations.ai" },
      { protocol: "https", hostname: "v3.fal.media" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
