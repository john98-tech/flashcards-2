/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    agentUpgrade: 'security',
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
