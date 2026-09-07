import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const allowed = [
    "overview",
    "alerts",
    "patients",
    "devices",
    "insights",
    "integrations",
    "audit",
  ] as const;
  if (!allowed.includes(section as (typeof allowed)[number])) notFound();
  const user = await currentUser();
  if (!user) redirect("/login");
  if (
    section === "patients" &&
    !["admin", "clinician", "researcher"].includes(user.role)
  )
    redirect("/overview");
  if (section === "audit" && !["admin", "security"].includes(user.role))
    redirect("/overview");
  return <Workspace section={section as (typeof allowed)[number]} />;
}
