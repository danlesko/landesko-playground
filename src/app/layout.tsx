import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import Image from "next/image";
import MySidebar from "@/src/components/MySidebar";
import { Button } from "@rewind-ui/core";
import { signIn, signOut, auth } from "@/auth";

const mont = Montserrat({ weight: ["400", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Landesko's Playground",
  description: "Dan Lesko's Portfolio Playground and Blog",
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
          {/* Navbar with z-index */}
          <nav className="row-span-1 col-span-full bg-gradient-to-r from-purple-700 to-cyan-500 p-4 text-zinc-200 font-bold shadow-zinc-900 shadow-lg z-10">
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
          </nav>

          <div className="flex flex-col lg:flex-row flex-1">
            {/* Sidebar/Navbar */}
            <MySidebar />

            {/* Main Content */}
            <main className="flex-1 bg-zinc-900 p-4 text-zinc-300">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
