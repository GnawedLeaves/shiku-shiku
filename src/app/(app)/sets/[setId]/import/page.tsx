import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ImportReview from "@/components/ImportReview";
import { isDocumentAiConfigured } from "@/lib/pdf/documentAi";
import { DEFAULT_TEMPLATE_ID, PDF_TEMPLATES } from "@/lib/pdf/templates";

export default async function ImportPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: set }, { data: groups }, { data: profile }] = await Promise.all([
    supabase.from("sets").select("id, name").eq("id", setId).single(),
    supabase.from("groups").select("id, name").eq("set_id", setId).order("created_at"),
    supabase.from("profiles").select("pdf_template_id").eq("id", user.id).single(),
  ]);

  if (!set) notFound();

  const ocrReady = isDocumentAiConfigured();
  const templates = PDF_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    available: template.mode === "document-ai" ? ocrReady : true,
  }));

  const preferred = profile?.pdf_template_id ?? DEFAULT_TEMPLATE_ID;
  const defaultTemplateId = templates.find((t) => t.id === preferred && t.available)
    ? preferred
    : DEFAULT_TEMPLATE_ID;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Import into {set.name}</h1>
      <ImportReview
        setId={setId}
        templates={templates}
        defaultTemplateId={defaultTemplateId}
        groups={groups ?? []}
      />
    </div>
  );
}
