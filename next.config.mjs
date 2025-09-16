/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // ✅ Warning: ignores ESLint errors in builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
