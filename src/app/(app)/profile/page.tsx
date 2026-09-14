import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { removeAvatar, updateProfile, uploadAvatar } from "@/lib/actions/profile";
import Avatar from "@/components/Avatar";
import SubmitButton from "@/components/ui/SubmitButton";
import BackButton from "@/components/ui/BackButton";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { count: friendCount }, { count: sessionCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("id", user.id)
      .single(),
    supabase
      .from("friendships")
      .select("id", { count: "exact", head: true })
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    supabase
      .from("session_results")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <BackButton href="/settings" />
      <h1 className="text-xl font-bold">Your profile</h1>

      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4 gap-4">
          <div className="flex items-center gap-4">
            <Avatar url={profile?.avatar_url} name={profile?.display_name ?? user.email} size="lg" />
            <div className="min-w-0">
              <p className="font-semibold truncate">{profile?.display_name ?? "No name yet"}</p>
              {profile?.username && <p className="text-sm opacity-70">@{profile.username}</p>}
              <p className="text-xs opacity-60 truncate">{user.email}</p>
            </div>
          </div>

          <form action={uploadAvatar} className="flex flex-col gap-2">
            <label className="form-control">
              <span className="label-text mb-1">Profile picture</span>
              <input
                type="file"
                name="avatar"
                accept="image/png,image/jpeg,image/webp,image/gif"
                required
                className="file-input file-input-bordered file-input-sm w-full"
              />
              <span className="label-text-alt opacity-60 mt-1">JPEG, PNG, WebP or GIF, up to 3 MB.</span>
            </label>
            <div className="flex gap-2">
              <SubmitButton className="btn btn-primary btn-sm" pendingText="Uploading…">
                Upload
              </SubmitButton>
            </div>
          </form>

          {profile?.avatar_url && (
            <form action={removeAvatar}>
              <SubmitButton className="btn btn-ghost btn-xs" pendingText="Removing…">
                Remove picture
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4 gap-3">
          <h2 className="font-semibold text-sm">Details</h2>
          <form action={updateProfile} className="flex flex-col gap-3">
            <label className="form-control">
              <span className="label-text mb-1">Display name</span>
              <input
                name="display_name"
                defaultValue={profile?.display_name ?? ""}
                className="input input-bordered w-full"
                placeholder="How friends see you"
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Username</span>
              <input
                name="username"
                defaultValue={profile?.username ?? ""}
                className="input input-bordered w-full"
                placeholder="e.g. marcel31"
              />
              <span className="label-text-alt opacity-60 mt-1">
                3–20 characters. Friends use this to find you.
              </span>
            </label>
            <SubmitButton className="btn btn-primary btn-sm self-start" pendingText="Saving…">
              Save
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="stats stats-horizontal shadow-sm bg-base-100 w-full">
        <div className="stat p-3">
          <div className="stat-title text-xs">Friends</div>
          <div className="stat-value text-2xl">{friendCount ?? 0}</div>
        </div>
        <div className="stat p-3">
          <div className="stat-title text-xs">Sessions finished</div>
          <div className="stat-value text-2xl">{sessionCount ?? 0}</div>
        </div>
      </div>

      <div className="flex gap-2">
        <Link href="/friends" className="btn btn-outline btn-sm">
          Friends
        </Link>
        <Link href="/history" className="btn btn-outline btn-sm">
          Study history
        </Link>
      </div>
    </div>
  );
}
