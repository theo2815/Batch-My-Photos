/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Vite build never gated on lint; keep that behavior. The pre-existing
  // react-hooks baseline is tracked via `npm run lint`, not the build.
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
