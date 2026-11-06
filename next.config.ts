import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second dev/verify server run beside the main one without sharing .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
