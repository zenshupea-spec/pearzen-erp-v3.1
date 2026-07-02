import "./globals.css";

import type { Metadata, Viewport } from "next";
import type React from "react";

import {
  buildFaviconMetadata,
  resolveTenantCompanyLogoUrl,
} from "../lib/tenant-company-logo-server";

export async function generateMetadata(): Promise<Metadata> {
  const logoUrl = await resolveTenantCompanyLogoUrl();
  return {
    title: "PEARZEN ERP - Back Office",
    description: "Head Office / OM / HR / FM / MD-OD",
    icons: buildFaviconMetadata(logoUrl),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** App is auth-gated; avoid static prerender failures on client hooks. */
export const dynamic = "force-dynamic";

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen overflow-x-hidden antialiased">
        {props.children}
      </body>
    </html>
  );
}

