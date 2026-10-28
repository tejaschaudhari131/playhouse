import { fileURLToPath } from "node:url"
import { execSync } from "node:child_process"

function commitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
  } catch {
    return ""
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: fileURLToPath(new URL("../", import.meta.url)),
  async headers() {
    return [
      { source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), usb=()' },
      ] },
      { source: '/data/studio/:file([a-z0-9-]+\\.[0-9a-f]{16}\\.json)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ]
  },
  async redirects() {
    // Old shared URLs recover only their parcel via the compatibility redirect.
    // Studio stays statically rendered; the redirect drops legacy scenario data.
    return [{ source: '/', has: [{ type: 'query', key: 's' }], destination: '/explore', permanent: false }]
  },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha().slice(0, 12),
    NEXT_PUBLIC_BUILT_AT: new Date().toISOString(),
  },
}

export default nextConfig
