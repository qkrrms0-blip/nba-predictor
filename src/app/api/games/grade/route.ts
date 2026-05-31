// src/app/api/games/grade/route.ts
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

async function fetchESPNResult(espnId: string): Promise<{
  completed: boolean;
  homeScore: number | null;
  awayScore: number | null;
  winner: "home" | "away" | null;
} | null> {
  try {
    const res = await fetch(`${ESPN_BASE}/summary?event=${espnId}`);
    if (!res.ok) return null;
    const json = await res.json();

    const comp = json.header?.competitions?.[0];
    if (!comp) return null;

    const completed = comp.status?.type?.completed ?? false;
    if (!completed) return null;

    const home = comp.competitors?.find((c: any) => c.homeAway === "home");
    const away = comp.competitors?.find((c: any) => c.homeAway === "away");
    if (!home || !away) return null;

    const homeScore = parseInt(home.score) || null;
    const awayScore = parseInt(away.score) || null;

    let winner: "home" | "away" | null = null;
    if (homeScore !== null && awayScore !== null) {
      winner = homeScore > awayScore ? "home" : "away";
    }

    return { completed, homeScore, awayScore, winner };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // 관리자 권한 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminSupabase = createAdminClient();

  // winner가 null이고 시작시간이 지난 경기만 대상
  const now = new Date().toISOString();
  const { data: pendingGames, error } = await adminSupabase
    .from("games")
    .select("id, external_id, home_score, away_score")
    .is("winner", null)
    .lt("start_time", now)
    .not("external_id", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pendingGames || pendingGames.length === 0) {
    return NextResponse.json({ success: true, graded: 0, message: "채점할 경기 없음" });
  }

  let graded = 0;
  const results: string[] = [];

  for (const game of pendingGames) {
    // external_id: "espn_1234567" → "1234567"
    const espnId = game.external_id?.replace("espn_", "");
    if (!espnId) continue;

    const result = await fetchESPNResult(espnId);
    if (!result || !result.completed || !result.winner) continue;

    // grade_votes RPC 호출 (기존 Supabase 함수 재사용)
    const { error: gradeError } = await adminSupabase.rpc("grade_votes", {
      p_game_id: game.id,
      p_winner: result.winner,
    });

    if (!gradeError) {
      // 스코어도 업데이트
      await adminSupabase.from("games").update({
        home_score: result.homeScore,
        away_score: result.awayScore,
      }).eq("id", game.id);

      graded++;
      results.push(`game ${game.id}: ${result.winner} 승`);
    }
  }

  return NextResponse.json({
    success: true,
    graded,
    total: pendingGames.length,
    results,
  });
}
