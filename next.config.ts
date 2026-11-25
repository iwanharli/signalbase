import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second dev/verify server run beside the main one without sharing .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Old Indonesian page paths keep working.
  async redirects() {
    return [
      { source: "/kunci-api", destination: "/project", permanent: true },
      // Temporary (307) so browsers do not cache it while the new path settles.
      { source: "/api-keys/:path*", destination: "/project/:path*", permanent: false },
      { source: "/dokumentasi", destination: "/docs", permanent: true },
      { source: "/media/sosial", destination: "/media/social", permanent: true },
    ];
  },
};

export default nextConfig;
