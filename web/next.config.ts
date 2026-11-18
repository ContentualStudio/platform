import path from "path";
import type { NextConfig } from "next";

// The monorepo hoists dependencies to the workspace root, so both file
// tracing and Turbopack's module resolution have to be rooted there.
const workspaceRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  reactCompiler: true,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    turbopackRustReactCompiler: true,
  },
  async rewrites() {
    const target = process.env.API_ORIGIN?.replace(/\/$/, "");

    if (!target) {
      return [];
    }

    return [{ destination: `${target}/:path*`, source: "/api-proxy/:path*" }];
  },
};

export default nextConfig;
