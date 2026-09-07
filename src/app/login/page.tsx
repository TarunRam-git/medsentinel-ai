import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Login from "@/components/login";
export const dynamic="force-dynamic";
export default async function LoginPage(){if(await currentUser())redirect("/overview");return <Login demo={process.env.ENABLE_DEMO==="true"}/>;}
