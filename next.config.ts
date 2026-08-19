import type { NextConfig } from "next";

// No CORS headers: every API route is called same-origin from this app, so
// nothing needs cross-origin access. The previous block applied
// `Access-Control-Allow-Origin: *` together with
// `Access-Control-Allow-Credentials: true` to all of /api/*, including the
// next-auth handler.
const nextConfig: NextConfig = {};

export default nextConfig;
