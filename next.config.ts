import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  compress: true,
  productionBrowserSourceMaps: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
