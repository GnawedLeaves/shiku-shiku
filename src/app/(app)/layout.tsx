import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import BottomNav from "@/components/BottomNav";
import SubmitButton from "@/components/ui/SubmitButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-concrete">
      <header className="sticky top-0 z-10 bg-concrete border-b border-iron">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="text-subheading whitespace-nowrap">
            しく SHIKU
          </Link>
          <form action={signOut}>
            <SubmitButton className="btn btn-primary btn-sm" pendingText="Logging out…">
              Log out
            </SubmitButton>
          </form>
        </div>
      </header>
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 pt-6 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">{children}</main>
      <BottomNav />
    </div>
  );
}
