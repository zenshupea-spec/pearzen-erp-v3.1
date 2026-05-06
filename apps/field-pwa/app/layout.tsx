import "./globals.css";

import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "PEARZEN ERP - Field PWA",
  description: "Field Guards / Android PWA (scaffold)"
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{props.children}</body>
    </html>
  );
}

