import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // /camera/* 反代到板子本機的 5000（cam_server.py）
      { source: "/camera/:path*", destination: "http://127.0.0.1:5000/:path*" },
    ]
  },
}

export default nextConfig
