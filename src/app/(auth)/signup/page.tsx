import Link from "next/link";
import { signUpWithPassword, signInWithGoogle } from "@/lib/actions/auth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen flex flex-col w-full max-w-[1440px] mx-auto">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <span className="text-subheading whitespace-nowrap">しく SHIKU</span>
        <div className="flex items-center gap-2">
          <span className="text-body-sm text-right">Have an account?</span>
          <Link href="/login" className="btn btn-primary btn-sm">
            Log in
          </Link>
        </div>
      </header>

      <h1 aria-label="Shiku Shiku" className="display px-3 pt-10 pb-6 sm:px-5 overflow-hidden">
        Shiku
        <br />
        Shiku
      </h1>

      <hr className="hairline" />

      <div className="w-full max-w-sm px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-3">
          <p className="text-subheading mb-2">Create an account to get started</p>

          {params.error && <div className="alert alert-error text-sm py-2">{params.error}</div>}

          <form action={signUpWithPassword} className="flex flex-col gap-3">
            <label className="form-control">
              <span className="label-text mb-1">Display name</span>
              <input name="displayName" type="text" required className="input input-bordered w-full" />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Email</span>
              <input name="email" type="email" required className="input input-bordered w-full" />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={6}
                className="input input-bordered w-full"
              />
            </label>
            <button type="submit" className="btn btn-primary mt-2">
              Sign up
            </button>
          </form>

          <div className="divider text-xs">or</div>

          <form action={signInWithGoogle}>
            <button type="submit" className="btn btn-outline w-full">
              Continue with Google
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
