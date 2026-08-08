/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // Static export can't optimize images at runtime; these are decorative anyway.
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
