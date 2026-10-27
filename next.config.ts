import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compile Tailwind CSS v4 (@import "tailwindcss" in app/globals.css).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
