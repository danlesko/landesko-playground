import type { Metadata } from "next";
import { Montserrat } from 'next/font/google';
import "./globals.css";
import Link from "next/link";

const mont = Montserrat({ weight: ['400', '700'], subsets: ['latin'] });

export const metadata: Metadata = {
  title: "Landesko Playground",
  description: "Dan Lesko's Portfolio Playground and Blog",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${mont.className} antialiased`}
      >
        <div className="flex flex-col min-h-screen">
          {/* Navbar with z-index */}
          <nav className="row-span-1 col-span-full bg-gradient-to-r from-purple-700 to-cyan-500 p-4 text-zinc-200 font-bold shadow-zinc-900 shadow-lg z-10">
            Landesko's Playground
          </nav>

          <div className="flex flex-1">
            {/* Sidebar */}
            <aside className="bg-zinc-800 p-4 w-64 text-zinc-300">
            <ul className="space-y-2">
            <li>
              <Link href="/" className="block p-2 bg-zinc-800 rounded hover:bg-gray-400 hover:text-zinc-900">
                Home
              </Link>
            </li>
            <li>
              <Link href="/processing" className="block p-2 bg-zinc-800 rounded hover:bg-gray-400 hover:text-zinc-900">
                Processing
              </Link>
            </li>
            <li>
              <Link href="/contact" className="block p-2 bg-zinc-800 rounded hover:bg-gray-400 hover:text-zinc-900">
                Contact
              </Link>
            </li>
          </ul>
            </aside>

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
