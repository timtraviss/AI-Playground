import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  experimental: {
    turbo: {
      root: path.resolve(__dirname),
    },
  },
}

export default nextConfig
