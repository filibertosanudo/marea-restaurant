import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirrors lib/env.ts's allowedImageHosts(): the storage host is either a
// custom MEDIA_HOSTNAME, or — for the s3 driver with none set — the S3
// endpoint's own host, since that's what publicUrl() falls back to. Can't
// import lib/env.ts here (server-only, and validated at runtime, not at
// this build-time config's load), so the same two cases are read directly.
const mediaHostname =
  process.env.MEDIA_HOSTNAME ||
  (process.env.STORAGE_DRIVER === "s3" && process.env.S3_ENDPOINT
    ? new URL(process.env.S3_ENDPOINT).hostname
    : undefined);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundles only the dependencies the build actually used into a
  // standalone server.js — an image of ~150MB instead of 1GB+, and the
  // same artifact runs on any host with Node, not just Vercel.
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  images: {
    // Only the storage host, never a wildcard — an open remote pattern
    // turns Next's image optimizer into an SSRF proxy for any URL an
    // admin can get into MenuItem.imageUrl.
    remotePatterns: mediaHostname ? [{ protocol: "https", hostname: mediaHostname }] : [],
  },
};

export default nextConfig;
