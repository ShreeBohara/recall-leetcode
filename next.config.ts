import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/runtime-selected DB drivers must stay external to the bundle.
  serverExternalPackages: ["better-sqlite3", "@libsql/client"],
};

export default nextConfig;
