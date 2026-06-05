// supabase/functions/random-auto-vote/index.ts
//
// Cron: 매 5분마다 실행
// - random_auto_vote = true 이고 미투표인 유저 자동투표
// - odds_auto_vote = true 이면 odds-api.io 배당 참조해서 유리한 팀 선택
// - odds_auto_vote = false 이면 50:50 랜덤 선택

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const ODDS_API_KEY = Deno.env.get("ODDS_API_KEY")!;

// odds-api.io에서 특정 경기의 유리한 팀 조회 (home/away)
// home_team, away_team 은 games 테이블의 팀명
async function getFavoriteTeam(
  home_team: string,
  away_team: string
): Promise<"home" | "away"> {
  try {
    const res = await fetch(
      `https://api.odds-api.io/v3/events?apiKey=${ODDS_API_KEY}&sport=nba`
    );
    const events = await res.json();

    // 팀명으로 경기 매칭 (대소문자 무시)
    const match = events?.find((e: { home: string; away: string }) =>
      e.home.toLowerCase().includes(home_team.toLowerCase()) ||
      home_team.toLowerCase().includes(e.home.toLowerCase()) ||
      e.away.toLowerCase().includes(away_team.toLowerCase()) ||
      away_team.toLowerCase().includes(e.away.toLowerCase())
    );

    if (!match) return Math.random() < 0.5 ? "home" : "away";

    // 배당 조회
    const oddsRes = await fetch(
      `https://api.odds-api.io/v3/odds?apiKey=${ODDS_API_KEY}&eventId=${match.id}&bookmakers=Bet365,DraftKings,Betfair`
    );
    const oddsData = await oddsRes.json();

    // 첫 번째 북메이커의 ML(moneyline) 배당 비교
    const bookmakers = oddsData?.bookmakers;
    if (!bookmakers) return Math.random() < 0.5 ? "home" : "away";

    const firstBook = Object.values(bookmakers)[0] as Array<{
      name: string;
      odds: Array<{ home?: string; away?: string }>;
    }>;
    const ml = firstBook?.find((m) => m.name === "ML");
    if (!ml?.odds?.[0]) return Math.random() < 0.5 ? "home" : "away";

    const homeOdds = parseFloat(ml.odds[0].home ?? "99");
    const awayOdds = parseFloat(ml.odds[0].away ?? "99");

    // 배당 낮은 쪽 = 승률 높은 팀
    return homeOdds <= awayOdds ? "home" : "away";
  } catch {
    // API 실패 시 랜덤으로 폴백
    return Math.random() < 0.5 ? "home" : "away";
  }
}

Deno.serve(async () => {
  try {
    const now = new Date();
    const in10min = new Date(now.getTime() + 10 * 60 * 1000);

    // ── 1. 지금부터 10분 이내 시작 경기 조회 ──────────────────
    const { data: games, error: gamesErr } = await supabase
      .from("games")
      .select("id, season_id, start_time, vote_deadline, home_team, away_team")
      .is("winner", null)
      .gte("vote_deadline", now.toISOString())
      .lte("vote_deadline", in10min.toISOString());

    if (gamesErr) throw gamesErr;
    if (!games || games.length === 0) {
      return new Response(JSON.stringify({ message: "대상 경기 없음" }), { status: 200 });
    }

    let totalVoted = 0;

    for (const game of games) {

      // ── 2. random_auto_vote = true 인 구독자 조회 ──────────
      const { data: subs, error: subsErr } = await supabase
        .from("push_subscriptions")
        .select("user_id, odds_auto_vote")
        .eq("random_auto_vote", true);

      if (subsErr) throw subsErr;
      if (!subs || subs.length === 0) continue;

      const userIds = subs.map((s: { user_id: string }) => s.user_id);

      // ── 3. 이미 투표한 유저 제외 ───────────────────────────
      const { data: voted, error: votedErr } = await supabase
        .from("votes")
        .select("user_id")
        .eq("game_id", game.id)
        .in("user_id", userIds);

      if (votedErr) throw votedErr;

      const votedUserIds = new Set(
        (voted ?? []).map((v: { user_id: string }) => v.user_id)
      );

      const unvotedSubs = subs.filter(
        (s: { user_id: string }) => !votedUserIds.has(s.user_id)
      );
      if (unvotedSubs.length === 0) continue;

      // ── 4. 배당 ON 유저가 있으면 odds-api.io 한 번만 조회 ──
      const hasOddsUsers = unvotedSubs.some(
        (s: { odds_auto_vote: boolean }) => s.odds_auto_vote
      );
      let favoriteTeam: "home" | "away" | null = null;
      if (hasOddsUsers) {
        favoriteTeam = await getFavoriteTeam(game.home_team, game.away_team);
        console.log(`game ${game.id} favorite: ${favoriteTeam}`);
      }

      // ── 5. 유저별 투표 결정 ────────────────────────────────
      const toInsert = unvotedSubs.map(
        (s: { user_id: string; odds_auto_vote: boolean }) => ({
          user_id: s.user_id,
          game_id: game.id,
          season_id: game.season_id,
          // 배당 ON → 배당 기준, OFF → 랜덤
          voted_team: s.odds_auto_vote && favoriteTeam
            ? favoriteTeam
            : Math.random() < 0.5 ? "home" : "away",
        })
      );

      const { error: insertErr } = await supabase.from("votes").insert(toInsert);
      if (insertErr) throw insertErr;

      totalVoted += toInsert.length;
      console.log(`game ${game.id}: ${toInsert.length}명 자동투표 완료`);
    }

    return new Response(
      JSON.stringify({ success: true, totalVoted }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("random-auto-vote error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});