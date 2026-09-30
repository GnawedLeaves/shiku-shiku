import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: {
    skipWaiting: true,
  },
});

const nextConfig: NextConfig = {
  // pdfjs is loaded at runtime by the PDF import route and must not be bundled.
  serverExternalPackages: ["pdfjs-dist"],
  images: {
    remotePatterns: [
      // Avatars served from Supabase Storage.
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

// The PWA plugin injects webpack config, which forces the slow webpack dev
// compiler. It's disabled in development anyway, so only apply it to
// production builds and let `next dev` use Turbopack.
export default process.env.NODE_ENV === "development" ? nextConfig : withPWA(nextConfig);
