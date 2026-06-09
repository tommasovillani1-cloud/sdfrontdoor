/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Databricks Apps run the app behind a platform proxy that forwards identity
  // headers. Keep the server runtime; do not statically export.
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb", // KB document uploads
    },
  },
};

export default nextConfig;
