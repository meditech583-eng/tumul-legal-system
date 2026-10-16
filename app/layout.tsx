
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tumul Legal | Legal Management System",
  description:
    "Secure Legal Management System for Tumul Legal, developed by Mtech IT Solutions",

  applicationName: "Tumul Legal",
  manifest: "/manifest.json",

  appleWebApp: {
    capable: true,
    title: "Tumul Legal",
    statusBarStyle: "default",
  },

  icons: {
    icon: "/tumul-logo.png",
    shortcut: "/tumul-logo.png",
    apple: "/tumul-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
