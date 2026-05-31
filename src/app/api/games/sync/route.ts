// src/app/api/games/sync/route.ts
import { createAdminClient } from "@/lib/supabase/server";
import { fetchGamesByDateRange, mapESPNGameToDBGame } from "@/lib/nba-api";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // seasonType: 2=정규시즌, 3=포스트시즌(기본값)
  const { startDate, endDate, seasonId, seasonType = 3 } = await request.json();

  try {
    const games = await fetchGamesByDateRange(startDate, endDate, seasonType);
    const adminSupabase = createAdminClient();

    let synced = 0;
    for (const game of games) {
      const dbGame = mapESPNGameToDBGame(game, seasonId || 1);
      const { error } = await adminSupabase
        .from("games")
        .upsert(dbGame, { onConflict: "external_id" });

      if (!error) synced++;
    }

    return NextResponse.json({ success: true, synced, total: games.length });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}