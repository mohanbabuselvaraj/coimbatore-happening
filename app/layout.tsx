import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coimbatore · A shared city",
  description: "Explore Coimbatore in 3D. Leave an anonymous note, find an event, or revisit a place.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
