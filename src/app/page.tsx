import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth";

export default async function RootPage() {
  const user = await getCurrentUser();

  redirect(user ? "/dashboard" : "/login");
}
