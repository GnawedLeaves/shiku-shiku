import type { Metadata, Viewport } from "next";
import { Archivo_Narrow } from "next/font/google";
import "./globals.css";

// Stand-in for KH Teka (commercial): a condensed grotesk that holds up at
// crushed line-heights and negative tracking.
const teka = Archivo_Narrow({
  variable: "--font-teka",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Shiku Shiku",
  description: "Learn Japanese vocabulary with swipeable flashcards.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Shiku Shiku",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#d9d9d9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Lets env(safe-area-inset-bottom) report the iPhone home-indicator area so
  // the bottom nav can clear it.
  viewportFit: "cover",
  // On Android, shrink the page (not just the visible area) when the keyboard
  // opens, so inputs like the battle chat stay on screen. iOS ignores this;
  // the chat handles iOS itself via visualViewport.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="shikushiku"
      className={`${teka.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
