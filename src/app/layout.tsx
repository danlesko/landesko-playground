import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import Image from "next/image";
import MySidebar from "@/components/MySidebar";
import { Button } from "@rewind-ui/core";
import { signIn, signOut, auth } from "@/auth";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const mont = Montserrat({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // og:image has to be an absolute URL, and without this the production build
  // warns and falls back to http://localhost:3000.
  //
  // It does NOT decide the og:image host. resolve-opengraph.js overrides
  // metadataBase whenever the URL is relative and the image comes from a
  // file-convention route, which opengraph-image.tsx is — so Next substitutes
  // its own fallback: the production domain in production, and the
  // per-deployment preview host in previews. This value is what silences the
  // warning and what every *other* relative metadata URL resolves against.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000",
  ),
  title: "Landesko's Playground",
  description: "Dan Lesko's Portfolio Playground and Blog",
  // `openGraph` omits title/description on purpose: Next inherits them from
  // each route's own `metadata`, so a link preview of /animation reads
  // "… - Animation". Setting them here pins every route to the root title.
  openGraph: {
    siteName: "Landesko's Playground",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="en">
      <body className={`${mont.className} antialiased`}>
        <div className="flex flex-col min-h-screen">
          {/* Site banner with z-index. A `header` and not a `nav`: it holds the
              branding and the sign-in control and not a single link, so as a
              `nav` it offered a navigation landmark with nothing navigable in
              it. `banner` needs this to sit outside article/aside/main/nav/
              section, which the plain wrapper below satisfies -- asserted in
              e2e/smoke.spec.ts, since that nesting rule fails quietly. */}
          <header className="row-span-1 col-span-full bg-gradient-to-r from-purple-700 to-cyan-500 p-4 text-zinc-200 font-bold shadow-zinc-900 shadow-lg z-10">
            <div className="flex items-center justify-between">
              <span className="flex items-center space-x-4">
                <Image
                  src="/slide.png"
                  alt="Landesko's Playground"
                  width="40"
                  height="40"
                />
                <span className="pl-1 text-xl">Landesko's Playground</span>
              </span>
              {!session?.user ? (
                <form
                  action={async () => {
                    "use server";
                    await signIn("github");
                  }}
                >
                  <Button
                    type="submit"
                    variant="primary"
                    className="mt-1"
                    size="sm"
                  >
                    Login
                  </Button>
                </form>
              ) : (
                <form
                  action={async () => {
                    "use server";
                    await signOut();
                  }}
                >
                  <Button
                    type="submit"
                    variant="primary"
                    className="mt-1"
                    size="sm"
                  >
                    Logout
                  </Button>
                </form>
              )}
            </div>
          </header>

          <div className="flex flex-col lg:flex-row flex-1">
            {/* Sidebar/Navbar */}
            <MySidebar />

            {/* Main Content */}
            <main className="flex-1 bg-background p-4 text-foreground">
              {children}
            </main>
          </div>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
