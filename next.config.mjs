/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // ✅ Warning: ignores TypeScript errors in builds
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
