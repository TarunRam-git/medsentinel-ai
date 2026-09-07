import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "MedSentinel AI · Clinical Integrity", description: "An evidence-led clinical integrity and cyber-physical security research workspace for smart hospitals." };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
