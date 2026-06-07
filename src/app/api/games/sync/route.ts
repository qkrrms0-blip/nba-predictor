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

    // 기존 경기 external_id + winner + status + start_time 한 번에 조회
    const externalIds = games.map((g) => `espn_${g.id}`);
    const { data: existing } = await adminSupabase
      .from("games")
      .select("external_id, winner, status, start_time")
      .in("external_id", externalIds);

    // Map으로 기존 데이터 저장
    const existingMap = new Map(
      (existing || []).map((g: { external_id: string; winner: string | null; status: string; start_time: string }) =>
        [g.external_id, { winner: g.winner, status: g.status, start_time: g.start_time }]
      )
    );

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const errors: { game: string; message: string; details: string }[] = [];

    for (const game of games) {
      const dbGame = mapESPNGameToDBGame(game, activeSeason.id);
      const existingData = existingMap.get(dbGame.external_id);

      // 신규
      if (!existingData) {
        const { error } = await adminSupabase
          .from("games")
          .upsert(dbGame, { onConflict: "external_id" });
        if (error) errors.push({ game: dbGame.external_id, message: error.message, details: error.details ?? "" });
        else inserted++;
        continue;
      }

      // winner, status, start_time 중 하나라도 바뀐 경우만 upsert
      const normalizeTime = (t: string | null) =>
        t ? new Date(t).toISOString() : null;

      const changed =
        existingData.winner !== dbGame.winner ||
        existingData.status !== dbGame.status ||
        normalizeTime(existingData.start_time) !== normalizeTime(dbGame.start_time);

      if (!changed) {
        unchanged++;
        continue;
      }

      // 변경된 경우 upsert
      const { error } = await adminSupabase
        .from("games")
        .upsert(dbGame, { onConflict: "external_id" });
      if (error) errors.push({ game: dbGame.external_id, message: error.message, details: error.details ?? "" });
      else updated++;
    }

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      unchanged,
      total: games.length,
      seasonName: activeSeason.name,
      errors,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}