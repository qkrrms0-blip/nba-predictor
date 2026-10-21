// src/app/api/cron/grade-games/route.ts
//
// pg_cron 이 하루 두 번 호출해서 끝난 경기를 채점한다.
// ESPN 이 Supabase Edge Function 의 요청을 403 으로 막는 경우가 있어서, ESPN 호출을 Vercel 서버에서 한다.
// 로그인 대신 CRON_SECRET 으로 호출자를 확인한다 (middleware 에서 /api/cron/ 은 로그인 예외).
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

type EspnResult =
  | { state: "done"; homeScore: number | null; awayScore: number | null; winner: "home" | "away" }
  | { state: "notDone" }
  | { state: "error"; reason: string };

async function fetchESPNResult(espnId: string): Promise<EspnResult> {
  try {
    const res = await fetch(`${ESPN_BASE}/summary?event=${espnId}`);
    if (!res.ok) return { state: "error", reason: `HTTP ${res.status}` };
    const json = await res.json();

    const comp = json.header?.competitions?.[0];
    if (!comp) return { state: "error", reason: "응답에 경기 정보 없음" };
    if (!(comp.status?.type?.completed ?? false)) return { state: "notDone" };

    const home = comp.competitors?.find((c: any) => c.homeAway === "home");
    const away = comp.competitors?.find((c: any) => c.homeAway === "away");
    if (!home || !away) return { state: "error", reason: "팀 정보 없음" };

    const homeScore = parseInt(home.score) || null;
    const awayScore = parseInt(away.score) || null;
    if (homeScore === null || awayScore === null || homeScore === awayScore) {
      return { state: "error", reason: "점수 확인 불가" };
    }
    return {
      state: "done",
      homeScore,
      awayScore,
      winner: homeScore > awayScore ? "home" : "away",
    };
  } catch (e) {
    return { state: "error", reason: String(e) };
  }
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET 미설정" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // winner가 null이고 시작시간이 지난 경기만 대상 (취소/연기 경기는 제외)
  const now = new Date().toISOString();
  const { data: pendingGames, error } = await supabase
    .from("games")
    .select("id, external_id, status")
    .is("winner", null)
    .lt("start_time", now)
    .not("external_id", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const targets = (pendingGames ?? []).filter(
    (g: { status: string | null }) => g.status !== "postponed" && g.status !== "cancelled"
  );
  if (targets.length === 0) {
    return NextResponse.json({ success: true, graded: 0, message: "채점할 경기 없음" });
  }

  let graded = 0;
  let notDone = 0;
  const failures: string[] = [];

  for (const game of targets) {
    const espnId = game.external_id?.replace("espn_", "");
    if (!espnId) continue;

    const result = await fetchESPNResult(espnId);
    if (result.state === "notDone") {
      notDone++;
      continue;
    }
    if (result.state === "error") {
      failures.push(`game ${game.id}: ${result.reason}`);
      continue;
    }

    const { error: gradeError } = await supabase.rpc("grade_votes", {
      p_game_id: game.id,
      p_winner: result.winner,
    });
    if (gradeError) {
      failures.push(`game ${game.id}: grade_votes ${gradeError.message}`);
      continue;
    }

    await supabase
      .from("games")
      .update({ home_score: result.homeScore, away_score: result.awayScore })
      .eq("id", game.id);
    graded++;
  }

  return NextResponse.json({
    success: true,
    graded,
    notDone,
    total: targets.length,
    failures,
  });
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}
