import Link from "next/link";
import { signUpWithPassword, signInWithGoogle } from "@/lib/actions/auth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-base-200 p-4">
      <div className="card w-full max-w-sm bg-base-100 shadow-xl">
        <div className="card-body">
          <h1 className="text-2xl font-bold text-center">しく Shiku Shiku</h1>
          <p className="text-center text-sm opacity-70 mb-2">Create an account to get started</p>

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

          <div className="divider text-xs">OR</div>

          <form action={signInWithGoogle}>
            <button type="submit" className="btn btn-outline w-full">
              Continue with Google
            </button>
          </form>

          <p className="text-center text-sm mt-4">
            Already have an account?{" "}
            <Link href="/login" className="link link-primary">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
