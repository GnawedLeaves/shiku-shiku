import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Invite links (/battle/join/CODE) land here: join the room, then go to it.
 * Signed-out visitors are sent to log in first by the middleware, which
 * brings them back to this link afterwards.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const { data: roomId, error } = await supabase.rpc("join_battle_room", { p_code: code });

  const target = roomId
    ? `/battle/${roomId}`
    : `/battle?error=${encodeURIComponent(error?.message ?? "Room not found")}`;
  return NextResponse.redirect(new URL(target, request.url));
}
