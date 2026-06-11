// src/app/voting/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  const kstHour = nowKST.getUTCHours();
  return kstHour >= 15 ? 1 : 0;
}

interface GameWithVotes extends Game {
  status?: string;
  vote_deadline?: string;
  myVote?: Vote;
  homeVotes?: number;
  awayVotes?: number;
  totalVotes?: number;
  correctVoters?: { name: string; points: number }[];
  correctCount?: number;
  homeVoters?: { name: string; userId: string }[];
  awayVoters?: { name: string; userId: string }[];
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
  const [allRankings, setAllRankings] = useState<RankingEntry[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [expandedGame, setExpandedGame] = useState<number | null>(null);
  const [voterPopupGame, setVoterPopupGame] = useState<number | null>(null);

  const GAMES_PER_PAGE = 5;

  const touchStartX = useRef<number | null>(null);
  const mouseStartX = useRef<number | null>(null);
  const wheelCooldown = useRef(false);
  const totalPagesRef = useRef(1);
  const pageIndexRef = useRef(0);

  const goNext = useCallback(() => {
    setPageIndex((p) => {
      const next = Math.min(p + 1, totalPagesRef.current - 1);
      pageIndexRef.current = next;
      return next;
    });
  }, []);
  const goPrev = useCallback(() => {
    setPageIndex((p) => {
      const prev = Math.max(p - 1, 0);
      pageIndexRef.current = prev;
      return prev;
    });
  }, []);

  // window에 직접 이벤트 — 어디서든 동작
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      const diff = touchStartX.current - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) diff > 0 ? goNext() : goPrev();
      touchStartX.current = null;
    };
    const onMouseDown = (e: MouseEvent) => { mouseStartX.current = e.clientX; };
    const onMouseUp = (e: MouseEvent) => {
      if (mouseStartX.current === null) return;
      const diff = mouseStartX.current - e.clientX;
      if (Math.abs(diff) > 40) diff > 0 ? goNext() : goPrev();
      mouseStartX.current = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (totalPagesRef.current <= 1) return;
      if (wheelCooldown.current) return;
      if (Math.abs(e.deltaY) < 30) return;
      wheelCooldown.current = true;
      e.deltaY > 0 ? goNext() : goPrev();
      setTimeout(() => { wheelCooldown.current = false; }, 600);
    };

    window.addEventListener("touchstart", onTouchStart);
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("wheel", onWheel);
    };
  }, [goNext, goPrev]);

  // 투표 현황 — 마감 전 경기 기준
  const [myVoteCount, setMyVoteCount] = useState(0);
  const [totalVotableCount, setTotalVotableCount] = useState(0);
  // 날짜탭: 경기 있는 날짜 offset set
  const [gameDateOffsets, setGameDateOffsets] = useState<Set<number>>(new Set());

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const loadTopRankers = useCallback(async () => {
    const { data: seasonData } = await supabase
      .from("seasons").select("id").eq("is_active", true).single();
    if (!seasonData) return;

    const { data: allUsers } = await supabase
      .from("users").select("id, name, email, bonus_points").eq("approved", true);

    const { data: votes } = await supabase
      .from("votes").select("user_id, is_correct, points").eq("season_id", seasonData.id);

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
    let i = 0, currentRank = 1;
    while (i < sorted.length && groups.length < 3) {
      const sameScore = sorted.filter((d) => d.total_points === sorted[i].total_points);
      const shuffled = [...sameScore].sort(() => Math.random() - 0.5);
      groups.push({ rank: currentRank, entries: shuffled });
      currentRank += sameScore.length;
      i += sameScore.length;
    }
    setTopRankers(groups);
    setAllRankings(sorted);
  }, []);

  const loadGames = useCallback(async (offset: number) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const targetDate = addDays(new Date(), offset);
    const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);

    let query = supabase
      .from("games").select("*")
      .gte("start_time", dayStart.toISOString())
      .lte("start_time", dayEnd.toISOString())
      .order("start_time");
    // 오늘 탭은 정산완료 게임도 표시, 나머지는 미정산만
    if (offset !== 0) query = query.is("winner", null);
    const { data: gamesData } = await query;

    if (!gamesData || gamesData.length === 0) {
      setGames([]);
      setLoading(false);
      return;
    }

    const gameIds = gamesData.map((g: Game) => g.id);
    const { data: myVotes } = await supabase.from("votes").select("*")
      .eq("user_id", user.id).in("game_id", gameIds);

    const now = new Date();

    // 마감 전 경기 id set
    const votableIds = new Set(
      gamesData
        .filter((g: any) => {
          const deadline = g.vote_deadline ? new Date(g.vote_deadline) : new Date(g.start_time);
          return deadline > now;
        })
        .map((g: Game) => g.id)
    );

    // 투표 현황은 loadOverallVoteCount에서 4일치 합산으로 관리

    // 마감됐거나 정산된 경기 전체 투표 현황 (퍼센트 바 + 적중자)
    // 마감 전 정산된 경우도 포함
    const closedIds = gamesData
      .filter((g: any) => !votableIds.has(g.id) || g.winner)
      .map((g: Game) => g.id);

    let voteStats: Record<number, { home: number; away: number }> = {};
    let correctVotersMap: Record<number, { name: string; points: number }[]> = {};
    let homeVotersMap: Record<number, { name: string; userId: string }[]> = {};
    let awayVotersMap: Record<number, { name: string; userId: string }[]> = {};

    if (closedIds.length > 0) {
      const { data: allVotes } = await supabase.from("votes")
        .select("game_id, voted_team, is_correct, points, user_id")
        .in("game_id", closedIds);

      const { data: allUsers } = await supabase.from("users").select("id, name");
      const userMap: Record<string, string> = {};
      allUsers?.forEach((u: { id: string; name: string }) => { userMap[u.id] = u.name; });

      allVotes?.forEach((v: { game_id: number; voted_team: string; is_correct: boolean | null; points: number | null; user_id: string }) => {
        if (!voteStats[v.game_id]) voteStats[v.game_id] = { home: 0, away: 0 };
        voteStats[v.game_id][v.voted_team as "home" | "away"]++;
        if (v.is_correct) {
          if (!correctVotersMap[v.game_id]) correctVotersMap[v.game_id] = [];
          correctVotersMap[v.game_id].push({ name: userMap[v.user_id] || "알 수 없음", points: v.points || 0 });
        }
        if (v.voted_team === "home") {
          if (!homeVotersMap[v.game_id]) homeVotersMap[v.game_id] = [];
          homeVotersMap[v.game_id].push({ name: userMap[v.user_id] || "알 수 없음", userId: v.user_id });
        } else {
          if (!awayVotersMap[v.game_id]) awayVotersMap[v.game_id] = [];
          awayVotersMap[v.game_id].push({ name: userMap[v.user_id] || "알 수 없음", userId: v.user_id });
        }
      });
    }

    const enriched: GameWithVotes[] = gamesData.map((game: GameWithVotes) => {
      const myVote = myVotes?.find((v: Vote) => v.game_id === game.id);
      const stats = voteStats[game.id];
      const correctVoters = correctVotersMap[game.id] || [];
      return {
        ...game, myVote,
        homeVotes: stats?.home || 0,
        awayVotes: stats?.away || 0,
        totalVotes: (stats?.home || 0) + (stats?.away || 0),
        correctVoters,
        correctCount: correctVoters.length,
        homeVoters: homeVotersMap[game.id] || [],
        awayVoters: awayVotersMap[game.id] || [],
      };
    });

    setGames(enriched);
    setLoading(false);
  }, []);

  // 오늘~+3일 4일치 전체 투표 현황
  const loadOverallVoteCount = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = addDays(now, 3); dayEnd.setHours(23, 59, 59, 999);

    const { data: gamesData } = await supabase
      .from("games").select("id, start_time, vote_deadline")
      .gte("start_time", dayStart.toISOString())
      .lte("start_time", dayEnd.toISOString())
      .is("winner", null);

    if (!gamesData || gamesData.length === 0) {
      setMyVoteCount(0);
      setTotalVotableCount(0);
      return;
    }

    const votableIds = new Set(
      gamesData
        .filter((g: any) => {
          const deadline = g.vote_deadline ? new Date(g.vote_deadline) : new Date(g.start_time);
          return deadline > now;
        })
        .map((g: any) => g.id)
    );

    const gameIdArr = Array.from(votableIds) as number[];
    const { data: myVotes } = await supabase.from("votes").select("game_id")
      .eq("user_id", user.id).in("game_id", gameIdArr);

    setTotalVotableCount(votableIds.size);
    setMyVoteCount((myVotes ?? []).filter((v: any) => votableIds.has(v.game_id)).length);

    // 날짜탭: 경기 있는 offset 계산 (오늘 기준 0~3)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const offsets = new Set<number>();
    gamesData.forEach((g: any) => {
      const d = new Date(g.start_time); d.setHours(0, 0, 0, 0);
      const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff <= 3) offsets.add(diff);
    });
    setGameDateOffsets(offsets);
  }, []);

  useEffect(() => { loadTopRankers(); }, [loadTopRankers]);
  useEffect(() => { loadOverallVoteCount(); }, [loadOverallVoteCount]);
  useEffect(() => { setPageIndex(0); loadGames(dateOffset); }, [dateOffset, loadGames]);

  const handleVote = async (gameId: number, team: "home" | "away", seasonId: number) => {
    const game = games.find((g) => g.id === gameId);
    if (!game) return;
    const deadline = game.vote_deadline ? new Date(game.vote_deadline) : new Date(game.start_time);
    if (deadline <= new Date()) { showToast("⛔ 투표가 마감되었습니다."); return; }
    if (game.myVote?.voted_team === team) {
      const { error } = await supabase.from("votes").delete().eq("id", game.myVote.id);
      if (!error) {
        showToast("투표가 취소되었습니다.");
        loadGames(dateOffset);
        loadOverallVoteCount();
      }
      return;
    }
    const wasVoted = !!game.myVote;
    const { error } = await supabase.from("votes").upsert(
      { user_id: userId, game_id: gameId, voted_team: team, season_id: seasonId },
      { onConflict: "user_id,game_id" }
    );
    if (error) showToast("❌ 투표 실패: " + error.message);
    else {
      showToast("✅ 투표 완료!");
      loadGames(dateOffset);
      loadOverallVoteCount();
    }
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
    <div style={{ touchAction: "pan-y", userSelect: "none" }}>
      {/* 시즌 랭킹 Top 3 */}
      {topRankers.length > 0 && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 14, padding: "10px 10px 8px", marginBottom: 6,
          display: "flex", justifyContent: "center", gap: 0,
        }}>
          {topRankers.map((group) => (
            <div key={group.rank} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              borderRight: group.rank < topRankers[topRankers.length - 1].rank
                ? "1px solid var(--border)" : "none",
              padding: "0 8px",
            }}>
              <span style={{ fontSize: group.rank === 1 ? 22 : 18, lineHeight: 1 }}>
                {rankIcon(group.rank)}
              </span>
              {(() => {
                const rep = group.entries[0];
                const rest = group.entries.length - 1;
                return (
                  <>
                    <span style={{
                      fontSize: 13, fontWeight: group.rank === 1 ? 700 : 600,
                      color: "var(--text)", textAlign: "center", lineHeight: 1.3,
                    }}>
                      {rep.name}
                      {rep.id === userId && (
                        <span style={{ fontSize: 10, color: "var(--accent2)", marginLeft: 3 }}>나</span>
                      )}
                    </span>
                    {rest > 0 && (
                      <span style={{ fontSize: 10, color: "#22c55e", lineHeight: 1 }}>
                        +{rest}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {/* 날짜 탭 + 투표현황 한 줄 */}
      <div style={{ display: "flex", alignItems: "center", padding: "6px 0" }}>
        <div className="date-tabs" style={{ padding: 0, flex: 1 }}>
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
                <span style={{ display: "block", fontSize: 10, marginTop: 1, opacity: gameDateOffsets.has(tab.offset) ? 1 : 0.7, color: gameDateOffsets.has(tab.offset) ? "#ffffff" : undefined }}>{dateStr}</span>
              </button>
            );
          })}
        </div>
        {totalVotableCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "var(--text-muted)", flexShrink: 0, paddingLeft: 8 }}>
            <span style={{ fontWeight: 700, color: myVoteCount === totalVotableCount ? "var(--green)" : "var(--text)" }}>{myVoteCount}</span>
            <span>/</span>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{totalVotableCount}</span>
            {myVoteCount === totalVotableCount && <span style={{ color: "var(--green)" }}>✓</span>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : games.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏀</div>
          <div className="empty-title">경기가 없습니다</div>
          <p style={{ fontSize: 13, marginTop: 4 }}>다른 날짜를 선택해보세요.</p>
        </div>
      ) : (() => {
        const totalPages = Math.min(Math.ceil(games.length / GAMES_PER_PAGE), 3);
        totalPagesRef.current = totalPages;
        const pagedGames = games.slice(pageIndex * GAMES_PER_PAGE, (pageIndex + 1) * GAMES_PER_PAGE);
        return (
          <>
            {/* 페이지 점 네비게이션 — 2페이지 이상일 때만 표시 */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 5, padding: "4px 0 2px" }}>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPageIndex(i)}
                    style={{
                      width: i === pageIndex ? 7 : 5,
                      height: i === pageIndex ? 7 : 5,
                      borderRadius: "50%",
                      background: i === pageIndex ? "var(--text)" : "rgba(150,150,150,0.5)",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
            )}

            {pagedGames.map((game) => {
              const closed = isDeadlinePassed(game);
              const isRegular = !ROUND_POINTS[game.round];
              const pts = ROUND_POINTS[game.round];
              const totalVotes = game.totalVotes || 0;
              const homePct = totalVotes > 0 ? Math.round((game.homeVotes || 0) / totalVotes * 100) : 50;
              const awayPct = 100 - homePct;

              const isInactive = (game as any).status === "postponed" || (game as any).status === "cancelled";
              const stampLabel = (game as any).status === "postponed" ? "POSTPONED" : "CANCELLED";

              return (
                <div key={game.id} className="game-card-compact" style={{ position: "relative", opacity: isInactive ? 0.45 : 1, pointerEvents: isInactive ? "none" : "auto" }}>
                  {isInactive && (
                    <div style={{
                      position: "absolute", top: "50%", left: "50%",
                      transform: "translate(-50%, -50%) rotate(-20deg)",
                      border: "3px solid #ef4444", borderRadius: 6,
                      padding: "3px 10px", color: "#ef4444",
                      fontSize: 16, fontWeight: 700, letterSpacing: 2,
                      whiteSpace: "nowrap", opacity: 0.85, zIndex: 10,
                      pointerEvents: "none",
                    }}>
                      {stampLabel}
                    </div>
                  )}
                  {/* 팀 로고 + 원형버튼 + VS메타 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>

                    {/* 왼쪽: 포스트시즌 라운드명 */}
                    <div style={{ width: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {!isRegular && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 9, color: "var(--accent)", fontWeight: 700, textAlign: "center", lineHeight: 1.3, whiteSpace: "pre-wrap", wordBreak: "keep-all", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.4)", borderRadius: 4, padding: "1px 4px" }}>
                            {game.round.replace(" ", "\n")}
                          </span>
                          {pts && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 4, padding: "1px 4px", whiteSpace: "nowrap" }}>
                              {pts}pt
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 홈팀: 버튼(바깥) | 로고(VS쪽) */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                      <button
                        className={`vote-circle-btn${game.myVote?.voted_team === "home" ? " selected-home" : ""}`}
                        onClick={() => !closed && handleVote(game.id, "home", game.season_id)}
                        disabled={closed}
                      >
                        {game.myVote?.voted_team === "home" ? "✓" : "승"}
                      </button>
                      <img
                        src={getTeamLogoUrl(game.home_team)} alt={game.home_team}
                        style={{
                          width: 56, height: 56, objectFit: "contain", flexShrink: 0,
                          filter: "drop-shadow(0 1px 6px rgba(0,0,0,0.5))",
                          opacity: game.winner && game.winner !== "home" ? 0.35 : 1
                        }}
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                      />
                    </div>

                    {/* 가운데 VS 메타블록: 시간 / 점수or VS / 마감 */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, flexShrink: 0, minWidth: 72 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {format(new Date(game.start_time), "HH:mm")}
                      </span>
                      {game.winner ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{
                            fontSize: 20, fontWeight: 800, whiteSpace: "nowrap",
                            color: game.winner === "home" ? "#3b82f6" : "var(--text-muted)"
                          }}>
                            {game.home_score ?? "-"}
                          </span>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>:</span>
                          <span style={{
                            fontSize: 20, fontWeight: 800, whiteSpace: "nowrap",
                            color: game.winner === "away" ? "#3b82f6" : "var(--text-muted)"
                          }}>
                            {game.away_score ?? "-"}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.1 }}>
                          VS
                        </span>
                      )}
                      {game.winner ? (
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>최종</span>
                      ) : game.vote_deadline ? (
                        closed
                          ? <span style={{ fontSize: 10, color: "var(--text-muted)" }}>투표 마감</span>
                          : <span style={{ fontSize: 14, color: "#ef4444", whiteSpace: "nowrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 400 }}>마감</span>{" "}
                            <span style={{ fontSize: 14, fontWeight: 700 }}>{format(new Date(game.vote_deadline), "M/d HH:mm")}</span>
                          </span>
                      ) : null}
                    </div>

                    {/* 원정팀: 로고(VS쪽) | 버튼(바깥) */}
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 6 }}>
                      <img
                        src={getTeamLogoUrl(game.away_team)} alt={game.away_team}
                        style={{
                          width: 56, height: 56, objectFit: "contain", flexShrink: 0,
                          filter: "drop-shadow(0 1px 6px rgba(0,0,0,0.5))",
                          opacity: game.winner && game.winner !== "away" ? 0.35 : 1
                        }}
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                      />
                      <button
                        className={`vote-circle-btn${game.myVote?.voted_team === "away" ? " selected-away" : ""}`}
                        onClick={() => !closed && handleVote(game.id, "away", game.season_id)}
                        disabled={closed}
                      >
                        {game.myVote?.voted_team === "away" ? "✓" : "승"}
                      </button>
                    </div>
                  </div>

                  {/* 마감 후 또는 정산된 경기: 퍼센트 바 */}
                  {(closed || game.winner) && totalVotes > 0 && (
                    <div
                      className="vote-stats"
                      style={{
                        marginTop: 8,
                        cursor: !isRegular ? "pointer" : "default",
                      }}
                      onClick={() => {
                        if (!isRegular) setVoterPopupGame(game.id);
                      }}
                    >
                      <span className="vote-pct">{homePct}%</span>
                      <div className="vote-bar">
                        <div className="vote-bar-fill" style={{ width: `${homePct}%` }} />
                      </div>
                      <span className="vote-pct">{awayPct}%</span>
                    </div>
                  )}

                  {/* 정산된 경기: 적중자 */}
                  {game.winner && (
                    <div style={{ marginTop: 6 }}>
                      <button
                        onClick={() => setExpandedGame(expandedGame === game.id ? null : game.id)}
                        style={{
                          width: "100%", textAlign: "left", background: "var(--surface2)",
                          border: "1px solid var(--border)", borderRadius: 8,
                          padding: "5px 10px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer",
                        }}>
                        적중자 {game.correctCount}명 {expandedGame === game.id ? "▲" : "▼"}
                      </button>
                      {expandedGame === game.id && (game.correctCount ?? 0) > 0 && (
                        <div style={{
                          marginTop: 6, padding: "6px 10px",
                          background: "rgba(34,197,94,0.08)",
                          borderRadius: 6, fontSize: 13, lineHeight: 1.8,
                        }}>
                          {game.correctVoters?.map((voter, i) => (
                            <span key={i}>
                              {voter.name}{i < (game.correctVoters?.length ?? 0) - 1 ? "\u00A0 " : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        );
      })()}
      {voterPopupGame !== null && (() => {
        const g = games.find(x => x.id === voterPopupGame);
        if (!g) return null;
        const totalV = g.totalVotes || 0;
        const hPct = totalV > 0 ? Math.round((g.homeVotes || 0) / totalV * 100) : 50;
        const aPct = 100 - hPct;
        const homeList = g.homeVoters || [];
        const awayList = g.awayVoters || [];

        // 내 랭킹 인덱스
        const myRankIdx = allRankings.findIndex(r => r.id === userId);

        const getVoterColor = (voterUserId: string) => {
          if (voterUserId === userId) return "var(--accent2)";
          const voterIdx = allRankings.findIndex(r => r.id === voterUserId);
          if (voterIdx === -1 || myRankIdx === -1) return "var(--text)";
          return voterIdx < myRankIdx ? "#ef4444" : "#3b82f6";
        };

        const renderList = (list: { name: string; userId: string }[]) => {
          if (list.length === 0) return <div style={{ fontSize: 11, color: "var(--text-muted)" }}>없음</div>;
          return (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
              {list.map((v, i) => (
                <span key={i} style={{
                  fontSize: 11,
                  color: getVoterColor(v.userId),
                  border: `1px solid ${getVoterColor(v.userId)}`,
                  borderRadius: 999,
                  padding: "2px 8px", whiteSpace: "nowrap",
                  width: list.length >= 8 ? "calc(50% - 2px)" : "auto",
                  textAlign: "center", boxSizing: "border-box",
                }}>
                  {v.name}
                </span>
              ))}
            </div>
          );
        };
        return (
          <div
            onClick={() => setVoterPopupGame(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 1000,
              background: "rgba(0,0,0,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 16, padding: "16px", width: "90%", maxWidth: 360,
                maxHeight: "80vh", overflowY: "auto",
              }}
            >
              {/* 투표자 명단 2열 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1px" }}>
                {/* 홈팀 */}
                <div style={{ borderRight: "1px solid var(--border)", paddingRight: 8, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <img src={getTeamLogoUrl(g.home_team)} alt={g.home_team}
                    style={{ width: 36, height: 36, objectFit: "contain", marginBottom: 2 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                  <div style={{ fontSize: 12, fontWeight: 700, color: g.myVote?.voted_team === "home" ? "#3b82f6" : "var(--text-muted)", marginBottom: 8 }}>{hPct}%</div>
                  {renderList(homeList)}
                </div>
                {/* 원정팀 */}
                <div style={{ paddingLeft: 8, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <img src={getTeamLogoUrl(g.away_team)} alt={g.away_team}
                    style={{ width: 36, height: 36, objectFit: "contain", marginBottom: 2 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                  <div style={{ fontSize: 12, fontWeight: 700, color: g.myVote?.voted_team === "away" ? "#3b82f6" : "var(--text-muted)", marginBottom: 8 }}>{aPct}%</div>
                  {renderList(awayList)}
                </div>
              </div>
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <button
                  onClick={() => setVoterPopupGame(null)}
                  style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}