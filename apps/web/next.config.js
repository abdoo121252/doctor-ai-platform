/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/agent", "@repo/db", "@repo/shared", "ai"],
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "pdf-parse"],
    // pdf.js resolves standard fonts + cmaps from its own package at runtime;
    // ship them with the serverless bundle for /api/parse so OCR works on Vercel.
    outputFileTracingIncludes: {
      "/api/parse": [
        "./node_modules/pdfjs-dist/standard_fonts/**/*",
        "./node_modules/pdfjs-dist/cmaps/**/*",
      ],
    },
  },
};

module.exports = nextConfig;
