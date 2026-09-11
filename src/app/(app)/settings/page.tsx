import { createClient } from "@/lib/supabase/server";
import { updateAnswerDisplayMode } from "@/lib/actions/settings";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("answer_display_mode, display_name")
    .eq("id", user!.id)
    .single();

  const mode = profile?.answer_display_mode ?? "both";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <h2 className="font-semibold text-sm">Answer display</h2>
          <p className="text-xs opacity-60">
            Choose how Japanese answers are shown on flashcards: romaji (roman letters), hiragana, or
            both.
          </p>
          <form action={updateAnswerDisplayMode} className="flex flex-col gap-2">
            {(["romaji", "hiragana", "both"] as const).map((option) => (
              <label key={option} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="answer_display_mode"
                  value={option}
                  defaultChecked={mode === option}
                  className="radio radio-sm radio-primary"
                />
                <span className="capitalize">{option}</span>
              </label>
            ))}
            <button type="submit" className="btn btn-primary btn-sm mt-2 self-start">
              Save
            </button>
          </form>
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body gap-1">
          <h2 className="font-semibold text-sm">Account</h2>
          <p className="text-sm opacity-70">{user?.email}</p>
        </div>
      </div>
    </div>
  );
}
