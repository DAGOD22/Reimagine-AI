import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s — ${BRAND.name}` },
  description: "Upload a real space, build a grounded renovation plan, and create a photorealistic redesign while preserving its architecture.",
  applicationName: BRAND.name,
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ed" },
    { media: "(prefers-color-scheme: dark)", color: "#181916" },
  ],
};

const themeScript = `
try {
  const value = localStorage.getItem('hearthform-theme') || 'system';
  const dark = value === 'dark' || (value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch (_) {}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
