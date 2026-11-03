import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/config";
import localFont from "next/font/local";
import "./globals.css";

const instrument = localFont({
  src: "../assets/fonts/instrument-sans.ttf",
  variable: "--font-instrument-sans",
  weight: "400 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: "Cash-flow planning for small federal construction contractors.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={instrument.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
