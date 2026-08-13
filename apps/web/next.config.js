/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/agent", "@repo/db", "@repo/shared"],
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
