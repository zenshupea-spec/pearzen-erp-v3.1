/** @type {import('next').NextConfig} */
const lanOrigin = process.env.LAN_DEV_ORIGIN?.trim();

const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  ...(lanOrigin ? { allowedDevOrigins: [lanOrigin] } : {}),
};

module.exports = nextConfig;

