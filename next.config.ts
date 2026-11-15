// Next.js settings for the whole website.
// Where it's used: Next.js reads this file when `npm run dev` or
// `npm run build` starts (restart the dev server after changing it).

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components: nothing is cached unless it says "use cache"
  // (see the caching notes in docs/PROGRESS.md)
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      // Tailwind CSS for every .css file
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Old admin addresses (Version 1.6 renamed the pages) send the browser to
  // the new ones, keeping the rest of the address and the ?filters:
  //   /admin/bookings/...  -> /admin/appointments/...
  //   /admin/payments      -> /admin/earnings
  // permanent: false = a temporary (307) redirect, so browsers don't
  // remember it forever. They run before src/proxy.ts, which then checks the
  // admin login on the new address as usual.
  async redirects() {
    return [
      { source: "/admin/bookings", destination: "/admin/appointments", permanent: false },
      { source: "/admin/bookings/:path*", destination: "/admin/appointments/:path*", permanent: false },
      { source: "/admin/payments", destination: "/admin/earnings", permanent: false },
    ];
  },
  images: {
    // next/image only loads photos from other websites that are listed here.
    // We allow ONLY the public "site-images" bucket of a Supabase project
    // (page photos, see src/lib/site-images.ts). "*" = any one project name,
    // so this works for our project without copying its address here.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/site-images/**",
      },
    ],
  },
};

export default nextConfig;
