// src/app/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { Season } from "@/lib/types";
import { getTeamLogoUrl } from "@/lib/nba-api";

interface GameResult {
  id: number;
  home_team: string;
  away_team: string;
  start_time: string;
  round: string;
  winner: "home" | "away" | null;
  season_id: number;
  correctVoters: { name: string; points: number }[];
  totalVotes: number;
  correctCount: number;
  myVotedTeam?: "home" | "away" | null;
  myIsCorrect?: boolean | null;
}

const PLAYOFF_MONTHS = [
  { value: "04", label: "4월" },
  { value: "05", label: "5월" },
  { value: "06", label: "6월" },
];

export default function HistoryPage() {
  const supabase = createClient();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<string | null>(null);
  const [filterDay, setFilterDay] = useState<string | null>(null);
  const [daysWithGames, setDaysWithGames] = useState<number[]>([]);
  const [allSeasonGames, setAllSeasonGames] = useState<GameResult[]>([]);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<number | null>(null);
  const [userId, setUserId] = useState<string>("");

  // 시즌 목록 초기 로드
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);

      const { data: seasonData } = await supabase
        .from("seasons").select("*").order("id", { ascending: false });
      if (seasonData) {
        setSeasons(seasonData);
        const active = seasonData.find((s: Season) => s.is_active);
        if (active) setSelectedSeason(active.id);
      }
    };
    init();
  }, []);

  // 시즌 변경 시 전체 경기 로드
  useEffect(() => {
    if (selectedSeason === null) return;
    loadSeasonGames(selectedSeason);
  }, [selectedSeason]);

  const loadSeasonGames = async (seasonId: number) => {
    setLoading(true);
    setFilterMonth(null);
    setFilterDay(null);

    const { data: { user } } = await supabase.auth.getUser();
    const currentUserId = user?.id || userId;

    const { data: games } = await supabase
      .from("games").select("*")
      .eq("season_id", seasonId)
      .not("winner", "is", null)
      .order("start_time", { ascending: false });

    if (!games || games.length === 0) {
      setAllSeasonGames([]); setGameResults([]); setLoading(false); return;
    }

    const gameIds = games.map((g: any) => g.id);
    const { data: votes } = await supabase
      .from("votes").select("game_id, is_correct, points, user_id, voted_team")
      .in("game_id", gameIds);
    const { data: allUsers } = await supabase.from("users").select("id, name");

    const userMap: Record<string, string> = {};
    allUsers?.forEach((u: { id: string; name: string }) => { userMap[u.id] = u.name; });

    const results: GameResult[] = games.map((game: any) => {
      const gameVotes = votes?.filter((v: any) => v.game_id === game.id) || [];
      const correctVoters = gameVotes
        .filter((v: any) => v.is_correct === true)
        .map((v: any) => ({ name: userMap[v.user_id] || "알 수 없음", points: v.points || 0 }));
      const myVote = gameVotes.find((v: any) => v.user_id === currentUserId);
      return {
        ...game,
        correctVoters,
        totalVotes: gameVotes.length,
        correctCount: correctVoters.length,
        myVotedTeam: myVote?.voted_team ?? null,
        myIsCorrect: myVote?.is_correct ?? null,
      };
    });

    setAllSeasonGames(results);
    setGameResults(results);
    setLoading(false);
  };

  // 월 선택 시 해당 월의 경기 있는 날짜 계산
  useEffect(() => {
    if (!filterMonth) {
      setDaysWithGames([]);
      setFilterDay(null);
      setGameResults(allSeasonGames);
      return;
    }
    const monthGames = allSeasonGames.filter((g) => {
      return format(new Date(g.start_time), "MM") === filterMonth;
    });
    const days = Array.from(
      new Set(monthGames.map((g) => new Date(g.start_time).getDate()))
    ).sort((a, b) => a - b);
    setDaysWithGames(days);
    setFilterDay(null);
    setGameResults(monthGames);
  }, [filterMonth, allSeasonGames]);

  // 날짜 선택 시 필터링
  useEffect(() => {
    if (!filterMonth) return;
    if (filterDay === null) {
      setGameResults(allSeasonGames.filter((g) => format(new Date(g.start_time), "MM") === filterMonth));
    } else {
      setGameResults(allSeasonGames.filter((g) => {
        const d = new Date(g.start_time);
        return format(d, "MM") === filterMonth && d.getDate() === Number(filterDay);
      }));
    }
  }, [filterDay]);

  return (
    <>
      {/* 시즌 선택 */}
      <div className="filter-row">
        <select className="filter-select" value={selectedSeason ?? ""}
          onChange={(e) => setSelectedSeason(Number(e.target.value))}>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.is_active ? " 🔴" : ""}</option>
          ))}
        </select>
      </div>

      {/* 월 선택 (원형) */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, justifyContent: "center" }}>
        {PLAYOFF_MONTHS.map((m) => (
          <button key={m.value}
            onClick={() => setFilterMonth(filterMonth === m.value ? null : m.value)}
            style={{
              width: 52, height: 52, borderRadius: "50%",
              background: filterMonth === m.value ? "var(--accent)" : "var(--surface2)",
              color: filterMonth === m.value ? "#fff" : "var(--text-muted)",
              border: filterMonth === m.value ? "none" : "1px solid var(--border)",
              fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.15s",
            }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* 날짜 선택 (경기 있는 날만 원형) */}
      {filterMonth && daysWithGames.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, justifyContent: "center" }}>
          <button onClick={() => setFilterDay(null)}
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: filterDay === null ? "var(--accent2)" : "var(--surface2)",
              color: filterDay === null ? "#fff" : "var(--text-muted)",
              border: filterDay === null ? "none" : "1px solid var(--border)",
              fontWeight: 600, fontSize: 11, cursor: "pointer",
            }}>전체</button>
          {daysWithGames.map((day) => (
            <button key={day} onClick={() => setFilterDay(String(day))}
              style={{
                width: 40, height: 40, borderRadius: "50%",
                background: filterDay === String(day) ? "var(--accent2)" : "var(--surface2)",
                color: filterDay === String(day) ? "#fff" : "var(--text)",
                border: filterDay === String(day) ? "none" : "1px solid var(--border)",
                fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>
              {day}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : gameResults.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <div className="empty-title">채점된 경기가 없습니다</div>
        </div>
      ) : (
        gameResults.map((game) => {
          const winnerTeam = game.winner === "home" ? game.home_team : game.away_team;
          const winnerAbbr = winnerTeam.split(" ").slice(-1)[0];
          const homeAbbr = game.home_team.split(" ").slice(-1)[0];
          const awayAbbr = game.away_team.split(" ").slice(-1)[0];

          // 테두리 색 결정
          let borderColor = "var(--border)";
          if (game.myIsCorrect === true) borderColor = "#3b82f6";
          else if (game.myIsCorrect === false) borderColor = "#ef4444";

          return (
            <div key={game.id} style={{
              background: "var(--surface)",
              border: `1.5px solid ${borderColor}`,
              borderRadius: "var(--radius)",
              padding: "8px 12px",
              marginBottom: 8,
              transition: "border-color 0.2s",
            }}>
              {/* 3컬럼 메인 행 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>

                {/* 좌: 라운드 + 날짜시간 (중앙정렬) */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0, minWidth: 72 }}>
                  {game.round && <span className="round-badge" style={{ fontSize: 10, padding: "2px 6px" }}>{game.round}</span>}
                  <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {format(new Date(game.start_time), "M/d HH:mm")}
                  </span>
                </div>

                {/* 중: 홈로고 팀명 VS 팀명 원정로고 */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <img src={getTeamLogoUrl(game.home_team)} alt={homeAbbr}
                    style={{ width: 22, height: 22, objectFit: "contain", flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{homeAbbr}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>VS</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{awayAbbr}</span>
                  <img src={getTeamLogoUrl(game.away_team)} alt={awayAbbr}
                    style={{ width: 22, height: 22, objectFit: "contain", flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                </div>

                {/* 우: 완료뱃지 + 승리팀 (우측정렬) */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                  <span className="badge badge-correct">완료</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    승리: <strong style={{ color: "var(--text)" }}>{winnerAbbr}</strong>
                  </span>
                </div>

              </div>

              {/* 적중자 */}
              {game.correctCount === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginTop: 6, textAlign: "center" }}>
                  아무도 맞추지 못했습니다
                </div>
              ) : (
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
                  {expandedGame === game.id && (
                    <div style={{
                      marginTop: 6, padding: "6px 10px",
                      background: "rgba(34,197,94,0.08)",
                      borderRadius: 6, fontSize: 13, lineHeight: 1.8,
                    }}>
                      {game.correctVoters.map((voter, i) => (
                        <span key={i}>
                          {voter.name}{i < game.correctVoters.length - 1 ? "\u00A0 " : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}