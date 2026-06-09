import "./globals.css";

import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Café Tasha — Order Online",
  description: "Browse the menu and place your order at Café Tasha",
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-100 antialiased">{props.children}</body>
    </html>
  );
}

