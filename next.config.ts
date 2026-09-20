import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // End-to-end tests start a dev server of their own next to `npm run dev`; one build directory
  // for both would break them.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // An imported file of up to 5 MB travels to a server action, with room for the form around it
    // (docs/АРХИТЕКТУРА.md, 3.11); the action checks the size of the file itself.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default withNextIntl(nextConfig);
