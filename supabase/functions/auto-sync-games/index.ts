// supabase/functions/auto-sync-games/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

function toESPNDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function mapESPNHeadlineToRound(headline: string): string {
  const h = headline.toLowerCase();
  if (h.includes("play-in") || h.includes("play in")) return "Play-In";
  if (h.includes("first round") || h.includes("1st round")) return "First Round";
  if (h.includes("semifinal") || h.includes("second round")) return "Semifinals";
  if (h.includes("conf") && h.includes("final")) return "Conf. Finals";
  if (h.includes("nba finals") || h.includes("championship")) return "Finals";
  return "First Round";
}

async function fetchGamesByDateRange(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const allGames: any[] = [];
  const seenIds = new Set<string>();

  const current = new Date(start);
  while (current <= end) {
    const dateStr = toESPNDate(current.toISOString().split("T")[0]);

    for (const seasonType of [2, 3]) {
      const url = `${ESPN_BASE}/scoreboard?dates=${dateStr}&seasontype=${seasonType}&limit=20`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (json.events) {
            for (const event of json.events) {
              if (!seenIds.has(event.id)) {
                seenIds.add(event.id);
                allGames.push(event);
              }
            }
          }
        }
      } catch {
        // 날짜별 실패 무시
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return allGames;
}

function mapESPNGameToDBGame(game: any, seasonId: number) {
  const comp = game.competitions[0];
  const home = comp.competitors.find((c: any) => c.homeAway === "home");
  const away = comp.competitors.find((c: any) => c.homeAway === "away");

  const isCompleted = comp.status.type.completed;
  const homeScore = parseInt(home.score) || null;
  const awayScore = parseInt(away.score) || null;

  let winner: "home" | "away" | null = null;
  if (isCompleted && homeScore !== null && awayScore !== null) {
    if (homeScore > awayScore) winner = "home";
    else if (awayScore > homeScore) winner = "away";
  }

  const headline = comp.notes?.[0]?.headline || "";
  const round = mapESPNHeadlineToRound(headline);

  const startTime = new Date(comp.date);
  const voteDeadline = new Date(startTime.getTime() - 60 * 60 * 1000);

  const seasonType = game.season?.type;
  const season_type = seasonType === 2 ? "regular" : "post";

  const statusName = comp.status.type.name;
  const status = statusName === "STATUS_POSTPONED" ? "postponed"
    : statusName === "STATUS_CANCELLED" ? "cancelled"
    : "scheduled";

  return {
    season_id: seasonId,
    home_team: home.team.displayName,
    away_team: away.team.displayName,
    home_score: isCompleted ? homeScore : null,
    away_score: isCompleted ? awayScore : null,
    start_time: comp.date,
    vote_deadline: voteDeadline.toISOString(),
    round,
    winner,
    season_type,
    status,
    external_id: `espn_${game.id}`,
  };
}

Deno.serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 활성 시즌 조회
    const { data: activeSeason } = await supabase
      .from("seasons")
      .select("id, name")
      .eq("is_active", true)
      .single();

    if (!activeSeason) {
      return new Response(JSON.stringify({ message: "활성 시즌 없음" }), { status: 200 });
    }

    // 오늘~+3일 (KST 기준)
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const startDate = nowKST.toISOString().slice(0, 10);
    const endDate = new Date(nowKST.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const games = await fetchGamesByDateRange(startDate, endDate);

    if (games.length === 0) {
      return new Response(JSON.stringify({ message: "ESPN 경기 없음", startDate, endDate }), { status: 200 });
    }

    // 기존 경기 조회
    const externalIds = games.map((g) => `espn_${g.id}`);
    const { data: existing } = await supabase
      .from("games")
      .select("external_id, winner, status, start_time")
      .in("external_id", externalIds);

    const existingMap = new Map(
      (existing || []).map((g: any) => [g.external_id, { winner: g.winner, status: g.status, start_time: g.start_time }])
    );

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const game of games) {
      const dbGame = mapESPNGameToDBGame(game, activeSeason.id);
      const existingData = existingMap.get(dbGame.external_id);

      // 신규
      if (!existingData) {
        const { error } = await supabase
          .from("games")
          .upsert(dbGame, { onConflict: "external_id" });
        if (!error) inserted++;
        continue;
      }

      // winner, status, start_time 변경 감지
      const changed =
        existingData.winner !== dbGame.winner ||
        existingData.status !== dbGame.status ||
        existingData.start_time !== dbGame.start_time;

      if (!changed) {
        unchanged++;
        continue;
      }

      const { error } = await supabase
        .from("games")
        .upsert(dbGame, { onConflict: "external_id" });
      if (!error) updated++;
    }

    // last_espn_sync 업데이트
    await supabase
      .from("seasons")
      .update({ last_espn_sync: startDate })
      .eq("id", activeSeason.id);

    return new Response(JSON.stringify({
      success: true,
      inserted,
      updated,
      unchanged,
      total: games.length,
      startDate,
      endDate,
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});