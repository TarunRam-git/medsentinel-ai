import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./ui-refinements.css";
export async function generateMetadata():Promise<Metadata>{
  const incoming=await headers();
  const origin=process.env.APP_ORIGIN??`http://${incoming.get("host")??"localhost:3000"}`;
  const title="MedSentinel AI · Clinical Integrity";
  const description="An evidence-led clinical integrity and cyber-physical security research workspace for smart hospitals.";
  const image=new URL("/og.png",origin).toString();
  return {title,description,metadataBase:new URL(origin),robots:{index:false,follow:false},openGraph:{title,description,type:"website",images:[{url:image,width:1730,height:909,alt:"MedSentinel AI. A clearer view of safer care."}]},twitter:{card:"summary_large_image",title,description,images:[image]}};
}
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
