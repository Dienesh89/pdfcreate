/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  // Don't bundle these: @sparticuz/chromium needs its bin/ folder at runtime
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/pdf": [
      "./app/api/pdf/fonts/NotoSansDevanagari.ttf",
      "./node_modules/@sparticuz/chromium/bin/**"
    ]
  },
  async redirects() {
    return [
      // One address for the home page: /index.html -> / (canonical is "/")
      { source: "/index.html", destination: "/", permanent: true }
    ];
  },
  async rewrites() {
    return {
      // Serve the static home page at "/" directly (no redirect), so "/" returns 200 with real HTML
      beforeFiles: [{ source: "/", destination: "/index.html" }]
    };
  },
  async headers() {
    return [
      // Big third-party libraries never change: let phones keep them in cache instead of re-downloading
      { source: "/vendor/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // App CSS/JS: reuse for a while, but check for updates in the background
      { source: "/:dir(css|js)/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
      // Images for search/social previews
      { source: "/:file(favicon.svg|favicon-32.png|apple-touch-icon.png|og-image.png)", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
      // Never index the API
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }
    ];
  }
};

export default nextConfig;

