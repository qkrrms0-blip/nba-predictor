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

  // seasonType 파라미터 제거 - ESPN 응답에서 자동 판단
  // seasonId 파라미터 제거 - 활성 시즌 자동 사용
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
    // seasonType 없이 호출 - 정규+포스트 둘 다 자동으로 가져옴
    const games = await fetchGamesByDateRange(startDate, endDate);
    const adminSupabase = createAdminClient();

    let synced = 0;
    const errors: { game: string; message: string; details: string }[] = [];

    for (const game of games) {
      // seasonType 파라미터 없이 호출 - ESPN 응답에서 직접 읽음
      const dbGame = mapESPNGameToDBGame(game, activeSeason.id);
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
        synced++;
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      total: games.length,
      seasonName: activeSeason.name,
      errors,
      sample: games[0] ? mapESPNGameToDBGame(games[0], activeSeason.id) : null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}