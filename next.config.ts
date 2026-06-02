import type { NextConfig } from "next";

// force rebuild
const nextConfig: NextConfig = {
  images: {
    domains: ["lh3.googleusercontent.com"],
  },
};

export default nextConfig;