// src/app/voting/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { format, addDays } from "date-fns";
import { ko } from "date-fns/locale";
import { Game, Vote, ROUND_POINTS, RankingEntry } from "@/lib/types";
import { getTeamLogoUrl } from "@/lib/nba-api";

const DATE_TABS = [
  { label: "오늘", offset: 0 },
  { label: "내일", offset: 1 },
  { label: "+2일", offset: 2 },
  { label: "+3일", offset: 3 },
];

// 한국 시간 기준 오후 3시(15:00) 이후면 내일(offset=1)을 기본값으로
function getDefaultDateOffset(): number {
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const kstHour = nowKST.getUTCHours(); // KST 시각 = UTC+9
  return kstHour >= 15 ? 1 : 0;
}

interface GameWithVotes extends Game {
  vote_deadline?: string;
  myVote?: Vote;
  homeVotes?: number;
  awayVotes?: number;
  totalVotes?: number;
}

interface TopRanker {
  rank: number;
  entries: RankingEntry[];
}

export default function VotingPage() {
  const supabase = createClient();
  const [dateOffset, setDateOffset] = useState<number>(getDefaultDateOffset);
  const [games, setGames] = useState<GameWithVotes[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [toast, setToast] = useState("");
  const [topRankers, setTopRankers] = useState<TopRanker[]>([]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const loadTopRankers = useCallback(async () => {
    const { data: seasonData } = await supabase
      .from("seasons")
      .select("id")
      .eq("is_active", true)
      .single();
    if (!seasonData) return;

    const { data: allUsers } = await supabase
      .from("users")
      .select("id, name, email, bonus_points")
      .eq("approved", true);

    const { data: votes } = await supabase
      .from("votes")
      .select("user_id, is_correct, points")
      .eq("season_id", seasonData.id);

    if (!allUsers) return;

    const rankMap: Record<string, RankingEntry> = {};
    allUsers.forEach((u: { id: string; name: string; email: string; bonus_points: number | null }) => {
      rankMap[u.id] = {
        id: u.id, name: u.name, email: u.email,
        season_id: seasonData.id, season_name: "",
        total_votes: 0, correct_votes: 0, total_points: u.bonus_points || 0, accuracy_pct: 0,
      };
    });

    votes?.forEach((v: { user_id: string; is_correct: boolean | null; points: number | null }) => {
      if (!rankMap[v.user_id]) return;
      rankMap[v.user_id].total_votes++;
      if (v.is_correct) {
        rankMap[v.user_id].correct_votes++;
        rankMap[v.user_id].total_points += v.points || 0;
      }
    });

    const sorted = Object.values(rankMap)
      .map((e) => ({ ...e, total_points: Math.round(e.total_points * 10) / 10 }))
      .sort((a, b) => b.total_points - a.total_points);

    const groups: TopRanker[] = [];
    let i = 0;
    let currentRank = 1;
    while (i < sorted.length && groups.length < 3) {
      const sameScore = sorted.filter((d) => d.total_points === sorted[i].total_points);
      groups.push({ rank: currentRank, entries: sameScore });
      currentRank += sameScore.length;
      i += sameScore.length;
    }

    setTopRankers(groups);
  }, []);

  const loadGames = useCallback(async (offset: number) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const targetDate = addDays(new Date(), offset);
    const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);

    const { data: gamesData } = await supabase
      .from("games").select("*")
      .gte("start_time", dayStart.toISOString())
      .lte("start_time", dayEnd.toISOString())
      .is("winner", null).order("start_time");

    if (!gamesData || gamesData.length === 0) {
      setGames([]); setLoading(false); return;
    }

    const gameIds = gamesData.map((g: Game) => g.id);
    const { data: myVotes } = await supabase.from("votes").select("*")
      .eq("user_id", user.id).in("game_id", gameIds);

    const now = new Date();
    const deadlinePassedIds = gamesData
      .filter((g: GameWithVotes) => g.vote_deadline && new Date(g.vote_deadline) <= now)
      .map((g: Game) => g.id);

    let voteStats: Record<number, { home: number; away: number }> = {};
    if (deadlinePassedIds.length > 0) {
      const { data: allVotes } = await supabase.from("votes")
        .select("game_id, voted_team").in("game_id", deadlinePassedIds);
      allVotes?.forEach((v: { game_id: number; voted_team: string }) => {
        if (!voteStats[v.game_id]) voteStats[v.game_id] = { home: 0, away: 0 };
        voteStats[v.game_id][v.voted_team as "home" | "away"]++;
      });
    }

    const enriched: GameWithVotes[] = gamesData.map((game: GameWithVotes) => {
      const myVote = myVotes?.find((v: Vote) => v.game_id === game.id);
      const stats = voteStats[game.id];
      return {
        ...game, myVote,
        homeVotes: stats?.home || 0,
        awayVotes: stats?.away || 0,
        totalVotes: (stats?.home || 0) + (stats?.away || 0),
      };
    });

    setGames(enriched); setLoading(false);
  }, []);

  useEffect(() => { loadTopRankers(); }, [loadTopRankers]);
  useEffect(() => { loadGames(dateOffset); }, [dateOffset, loadGames]);

  const handleVote = async (gameId: number, team: "home" | "away", seasonId: number) => {
    const game = games.find((g) => g.id === gameId);
    if (!game) return;
    const deadline = game.vote_deadline ? new Date(game.vote_deadline) : new Date(game.start_time);
    if (deadline <= new Date()) { showToast("⛔ 투표가 마감되었습니다."); return; }
    if (game.myVote?.voted_team === team) {
      const { error } = await supabase.from("votes").delete().eq("id", game.myVote.id);
      if (!error) { showToast("투표가 취소되었습니다."); loadGames(dateOffset); }
      return;
    }
    const { error } = await supabase.from("votes").upsert(
      { user_id: userId, game_id: gameId, voted_team: team, season_id: seasonId },
      { onConflict: "user_id,game_id" }
    );
    if (error) showToast("❌ 투표 실패: " + error.message);
    else { showToast("✅ 투표 완료!"); loadGames(dateOffset); }
  };

  const isDeadlinePassed = (game: GameWithVotes) => {
    const deadline = game.vote_deadline ? new Date(game.vote_deadline) : new Date(game.start_time);
    return deadline <= new Date();
  };

  const rankIcon = (rank: number) => {
    if (rank === 1) return "👑";
    if (rank === 2) return "🥈";
    return "🥉";
  };

  return (
    <>
      {/* 시즌 랭킹 Top 3 */}
      {topRankers.length > 0 && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "10px 10px 8px",
          marginBottom: 6,
          display: "flex",
          justifyContent: "center",
          gap: 0,
        }}>
          {topRankers.map((group) => (
            <div key={group.rank} style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              borderRight: group.rank < topRankers[topRankers.length - 1].rank
                ? "1px solid var(--border)" : "none",
              padding: "0 8px",
            }}>
              <span style={{ fontSize: group.rank === 1 ? 22 : 18, lineHeight: 1 }}>
                {rankIcon(group.rank)}
              </span>
              {group.entries.map((entry) => (
                <span key={entry.id} style={{
                  fontSize: 13,
                  fontWeight: group.rank === 1 ? 700 : 600,
                  color: "var(--text)",
                  textAlign: "center",
                  lineHeight: 1.3,
                }}>
                  {entry.name}
                  {entry.id === userId && (
                    <span style={{ fontSize: 10, color: "var(--accent2)", marginLeft: 3 }}>나</span>
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 날짜 탭 */}
      <div className="date-tabs" style={{ padding: "6px 0 6px" }}>
        {DATE_TABS.map((tab) => {
          const date = addDays(new Date(), tab.offset);
          const dateStr = format(date, "M/d (EEE)", { locale: ko });
          return (
            <button
              key={tab.offset}
              className={`date-tab ${dateOffset === tab.offset ? "active" : ""}`}
              onClick={() => setDateOffset(tab.offset)}
            >
              {tab.label}
              <span style={{ display: "block", fontSize: 10, opacity: 0.7, marginTop: 1 }}>{dateStr}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : games.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏀</div>
          <div className="empty-title">경기가 없습니다</div>
          <p style={{ fontSize: 13, marginTop: 4 }}>다른 날짜를 선택해보세요.</p>
        </div>
      ) : (
        games.map((game) => {
          const closed = isDeadlinePassed(game);
          const pts = ROUND_POINTS[game.round];
          const totalVotes = game.totalVotes || 0;
          const homePct = totalVotes > 0 ? Math.round((game.homeVotes || 0) / totalVotes * 100) : 50;
          const awayPct = 100 - homePct;
          // 포스트시즌 경기만 round 표시 (round가 null이 아닌 경우)
          const showRound = !!game.round;
          const homeLogo = getTeamLogoUrl(game.home_team);
          const awayLogo = getTeamLogoUrl(game.away_team);

          return (
            <div key={game.id} className="game-card-compact">
              {/* 상단: 라운드(포스트시즌만) + 경기시작시간 */}
              <div className="game-meta-compact">
                {showRound
                  ? <span className="round-badge">{game.round} · {pts}점</span>
                  : <span />
                }
                <span className="game-time">{format(new Date(game.start_time), "HH:mm")}</span>
              </div>

              {/* 팀 행: [홈로고] [홈승버튼]  VS  [원정승버튼] [원정로고] */}
              <div className="teams-compact">
                {/* 홈팀: [버튼] [로고] */}
                <div className="team-side home-side">
                  {!closed ? (
                    <button
                      className={`vote-btn-inline ${game.myVote?.voted_team === "home" ? "selected-home" : ""}`}
                      onClick={() => handleVote(game.id, "home", game.season_id)}
                    >
                      {game.home_team.split(" ").pop()} 승{game.myVote?.voted_team === "home" ? " ✓" : ""}
                    </button>
                  ) : (
                    <span className="team-name-sm">{game.home_team.split(" ").pop()}</span>
                  )}
                  <img
                    src={homeLogo}
                    alt={game.home_team}
                    className="team-logo-sm"
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                </div>

                {/* VS / 스코어 */}
                <div className="vs-center">
                  {game.home_score !== null && game.away_score !== null
                    ? <span className="score-display">{game.home_score} - {game.away_score}</span>
                    : <span className="vs-text">VS</span>
                  }
                </div>

                {/* 원정팀: [로고] [버튼] */}
                <div className="team-side away-side">
                  <img
                    src={awayLogo}
                    alt={game.away_team}
                    className="team-logo-sm"
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                  {!closed ? (
                    <button
                      className={`vote-btn-inline ${game.myVote?.voted_team === "away" ? "selected-away" : ""}`}
                      onClick={() => handleVote(game.id, "away", game.season_id)}
                    >
                      {game.away_team.split(" ").pop()} 승{game.myVote?.voted_team === "away" ? " ✓" : ""}
                    </button>
                  ) : (
                    <span className="team-name-sm">{game.away_team.split(" ").pop()}</span>
                  )}
                </div>
              </div>

              {/* 하단: 마감시간 (빨간색) */}
              {game.vote_deadline && (
                <div className="deadline-row">
                  {closed
                    ? "⛔ 투표 마감됨"
                    : `⏰ 마감: ${format(new Date(game.vote_deadline), "M/d HH:mm")}`
                  }
                </div>
              )}

              {/* 마감 후: 내 선택 + 투표 통계 */}
              {closed && (
                <>
                  {game.myVote && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 6 }}>
                      내 선택: <strong style={{ color: "var(--text)" }}>
                        {game.myVote.voted_team === "home" ? game.home_team : game.away_team}
                      </strong>
                    </div>
                  )}
                  {totalVotes > 0 && (
                    <div className="vote-stats" style={{ marginTop: 6 }}>
                      <span className="vote-pct">{homePct}%</span>
                      <div className="vote-bar">
                        <div className="vote-bar-fill" style={{ width: `${homePct}%` }} />
                      </div>
                      <span className="vote-pct">{awayPct}%</span>
                    </div>
                  )}
                  <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    총 {totalVotes}표
                  </div>
                </>
              )}
            </div>
          );
        })
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
