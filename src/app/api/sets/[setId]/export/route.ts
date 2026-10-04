import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { SET_CSV_HEADER, toCsv } from "@/lib/export/setCsv";

/** Downloads every card in a set as a CSV, one row per card. */
export async function GET(_request: Request, { params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const supabase = await createClient();
  const [{ data: set }, { data: groups }, { data: cards, error }] = await Promise.all([
    supabase.from("sets").select("name").eq("id", setId).single(),
    supabase.from("groups").select("id, name").eq("set_id", setId).order("created_at"),
    supabase
      .from("cards")
      .select("question, answer_hiragana, answer_romaji, answer_kanji, notes, card_groups(group_id)")
      .eq("set_id", setId)
      .order("created_at"),
  ]);

  if (!set) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const groupOrder = (groups ?? []).map((g) => g.id);
  const groupNames = new Map((groups ?? []).map((g) => [g.id, g.name]));

  const rows = (cards ?? []).map((card) => {
    const cardGroups = (card.card_groups ?? [])
      .map((link: { group_id: string }) => link.group_id)
      .sort((a: string, b: string) => groupOrder.indexOf(a) - groupOrder.indexOf(b))
      .map((id: string) => groupNames.get(id))
      .filter(Boolean);
    return [
      card.question,
      card.answer_hiragana ?? "",
      card.answer_romaji ?? "",
      card.answer_kanji ?? "",
      cardGroups.join("; "),
      card.notes ?? "",
    ];
  });

  const fileName = `${set.name.trim() || "set"}.csv`;
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

  return new Response(toCsv([SET_CSV_HEADER, ...rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
