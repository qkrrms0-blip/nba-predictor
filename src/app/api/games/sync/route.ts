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

  const { startDate, endDate } = await request.json();

  // 활성 시즌 자동 조회
  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id, name")
    .eq("is_active", true)
    .single();

  if (!activeSeason) {
    return NextResponse.json({ error: "활성 시즌이 없습니다. 시즌 탭에서 시즌을 시작해주세요." }, { status: 400 });
  }

  try {
    const games = await fetchGamesByDateRange(startDate, endDate);
    const adminSupabase = createAdminClient();

    // 해당 범위의 external_id 목록을 한 번에 조회해서 신규/업데이트 구분
    const externalIds = games.map((g) => `espn_${g.id}`);
    const { data: existing } = await adminSupabase
      .from("games")
      .select("external_id")
      .in("external_id", externalIds);

    const existingIds = new Set((existing || []).map((g: { external_id: string }) => g.external_id));

    let inserted = 0; // 신규
    let updated = 0;  // 업데이트
    const errors: { game: string; message: string; details: string }[] = [];

    for (const game of games) {
      const dbGame = mapESPNGameToDBGame(game, activeSeason.id);
      const isNew = !existingIds.has(dbGame.external_id);

      const { error } = await adminSupabase
        .from("games")
        .upsert(dbGame, { onConflict: "external_id" });

      if (error) {
        errors.push({
          game: dbGame.external_id,
          message: error.message,
          details: error.details ?? "",
        });
      } else {
        if (isNew) inserted++;
        else updated++;
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      total: games.length,
      seasonName: activeSeason.name,
      errors,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}