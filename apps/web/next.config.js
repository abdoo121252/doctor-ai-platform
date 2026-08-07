/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/agent", "@repo/db", "@repo/shared"],
};

module.exports = nextConfig;
