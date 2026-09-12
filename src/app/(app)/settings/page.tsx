import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updateAnswerDisplayMode, updatePdfTemplate } from "@/lib/actions/settings";
import { isDocumentAiConfigured } from "@/lib/pdf/documentAi";
import { DEFAULT_TEMPLATE_ID, PDF_TEMPLATES } from "@/lib/pdf/templates";
import SubmitButton from "@/components/ui/SubmitButton";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("answer_display_mode, display_name, pdf_template_id")
    .eq("id", user!.id)
    .single();

  const mode = profile?.answer_display_mode ?? "both";
  const templateId = profile?.pdf_template_id ?? DEFAULT_TEMPLATE_ID;
  const ocrReady = isDocumentAiConfigured();

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
            <SubmitButton className="btn btn-primary btn-sm mt-2 self-start" pendingText="Saving…">
              Save
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <h2 className="font-semibold text-sm">PDF import template</h2>
          <p className="text-xs opacity-60">
            Which layout the importer assumes by default. You can still switch templates on the
            import screen.
          </p>
          <form action={updatePdfTemplate} className="flex flex-col gap-2">
            {PDF_TEMPLATES.map((template) => {
              const available = template.mode !== "document-ai" || ocrReady;
              return (
                <label
                  key={template.id}
                  className={`flex items-start gap-2 cursor-pointer ${available ? "" : "opacity-50"}`}
                >
                  <input
                    type="radio"
                    name="pdf_template_id"
                    value={template.id}
                    defaultChecked={templateId === template.id}
                    disabled={!available}
                    className="radio radio-sm radio-primary mt-1"
                  />
                  <span>
                    <span className="block">{template.name}</span>
                    <span className="block text-xs opacity-60">{template.description}</span>
                    {!available && (
                      <span className="block text-xs text-warning">
                        Needs Document AI credentials — see docs/pdf-import.md
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
            <SubmitButton className="btn btn-primary btn-sm mt-2 self-start" pendingText="Saving…">
              Save
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body gap-2">
          <h2 className="font-semibold text-sm">Account</h2>
          <p className="text-sm opacity-70">{user?.email}</p>
          <div className="flex gap-2 mt-1">
            <Link href="/profile" className="btn btn-outline btn-sm">
              Edit profile
            </Link>
            <Link href="/battle" className="btn btn-outline btn-sm">
              Battles
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
