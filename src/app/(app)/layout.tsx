import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import BottomNav from "@/components/BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-base-200">
      <header className="navbar bg-base-100 shadow-sm sticky top-0 z-10">
        <div className="flex-1">
          <Link href="/dashboard" className="btn btn-ghost text-lg">
            しく Shiku Shiku
          </Link>
        </div>
        <div className="flex-none">
          <form action={signOut}>
            <button className="btn btn-ghost btn-sm">Log out</button>
          </form>
        </div>
      </header>
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 pt-4 pb-24">{children}</main>
      <BottomNav />
    </div>
  );
}
