import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import Image from "next/image";
import MainNav from "@/components/MainNav";
import { Button } from "@rewind-ui/core";
import { primaryButtonClasses } from "@/components/ui/button";
import { signIn, signOut } from "@/auth";
import { getSession } from "@/lib/session";
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

// Two actions on purpose, even though the form below is now shared. One action
// that re-read `auth()` would be a toggle, and a rendered page is stale by the
// time anyone clicks it: a reader whose session ended between render and submit
// would press "Login" and be signed out, and one who signed in elsewhere would
// press "Logout" and be sent to GitHub. Pinning the action at render time is
// what makes the button do what its label promised.
async function signInWithGithub() {
  "use server";
  await signIn("github");
}

async function signOutOfSession() {
  "use server";
  await signOut();
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  // Guarded on `session.user` and not `session`. This used to be the only thing
  // stopping a broken auth config from rendering the logged-in header to anonymous
  // readers: `auth()` resolved to a truthy object carrying an error, so the looser
  // check passed for everyone. That was CVE-worthy upstream too — GHSA-8fpg-xm3f-6cx3
  // — and next-auth 5.0.0-beta.32 fixed it, so a non-OK session response is now
  // parsed as no session at all.
  //
  // The guard stays, for a reason that does not depend on that bug: `Session["user"]`
  // is optional in @auth/core's types, so `session` being truthy has never implied a
  // user. It is now defence in depth rather than the only defence.
  const signedIn = Boolean(session?.user);
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
                {/* `text-white`, not the header's inherited `text-zinc-200`,
                    which measured 2.52:1 where the title's right edge reaches
                    the gradient's cyan end -- under the 3:1 its size requires
                    (#105). */}
                <span className="pl-1 text-xl text-white">
                  Landesko's Playground
                </span>
              </span>
              <form action={signedIn ? signOutOfSession : signInWithGithub}>
                <Button
                  type="submit"
                  variant="primary"
                  className={`mt-1 ${primaryButtonClasses}`}
                  size="sm"
                >
                  {signedIn ? "Logout" : "Login"}
                </Button>
              </form>
            </div>
          </header>

          {/* One axis at every width. This used to switch to a row at `lg`, which
              put the nav in a 250px column beside the content; #136 moved it to a
              band under the header. The nav still precedes `<main>` in the DOM
              exactly as before -- only the direction changed, and it no longer
              changes -- so reading and focus order are untouched by this. */}
          <div className="flex flex-col flex-1">
            <MainNav />

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
