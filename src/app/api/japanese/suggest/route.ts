import { NextResponse } from "next/server";
import { suggestJapanese } from "@/lib/japanese/suggest";
import { getCurrentUser } from "@/lib/supabase/auth";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const suggestions = await suggestJapanese(query);

  return NextResponse.json({ suggestions });
}
