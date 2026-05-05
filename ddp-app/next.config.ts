import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  basePath: '/ddp',
  experimental: {
    turbo: {
      root: path.resolve(__dirname),
    },
  },
}

export default nextConfig
