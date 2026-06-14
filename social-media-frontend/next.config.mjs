/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,

  // Image optimization — allow remote images from Cloudinary and Google avatar hosts
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'xsgames.co',
      },
    ],
    // Use modern formats for better compression
    formats: ['image/avif', 'image/webp'],
    // Limit device sizes to common breakpoints (reduces generated variants)
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Compress responses
  compress: true,

  // Power headers already set by backend — disable Next.js default
  poweredByHeader: false,
};

export default nextConfig;
