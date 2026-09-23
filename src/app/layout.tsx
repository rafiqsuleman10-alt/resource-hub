import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import Footer from "@/components/Footer";
import { DISPLAY_SCRIPT } from "@/lib/display";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: { default: "Resource Hub", template: "%s · Resource Hub" },
  description: "Reserve, collect and return shared campus equipment from smart lockers. A DUT design project demo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2C3A48" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1117" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The display script may add a theme or classes before React loads.
    <html lang="en-ZA" className={atkinson.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-surface px-4 py-2 font-bold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to main content
        </a>
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
