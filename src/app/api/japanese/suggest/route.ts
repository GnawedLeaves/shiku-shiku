import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestJapanese } from "@/lib/japanese/suggest";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const suggestions = await suggestJapanese(query);

  return NextResponse.json({ suggestions });
}
