import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: { remotePatterns: [] },
  serverExternalPackages: ["pg", "sharp"],
};

export default config;
