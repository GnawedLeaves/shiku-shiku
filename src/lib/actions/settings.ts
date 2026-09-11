"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AnswerDisplayMode } from "@/lib/supabase/database.types";

export async function updateAnswerDisplayMode(formData: FormData) {
  const mode = String(formData.get("answer_display_mode") ?? "both") as AnswerDisplayMode;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profiles").update({ answer_display_mode: mode }).eq("id", user.id);
  revalidatePath("/settings");
}
