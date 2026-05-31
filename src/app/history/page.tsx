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
  season_type?: string;
}

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
  const [seasonTypeFilter, setSeasonTypeFilter] = useState<"regular" | "post">("post");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

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

  // 현재 월 기준 자동 seasonType 결정
  useEffect(() => {
    const month = new Date().getMonth() + 1; // 1~12
    setSeasonTypeFilter(month >= 4 ? "post" : "regular");
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

  // seasonType 필터링된 경기
  const seasonFilteredGames = allSeasonGames.filter(
    (g) => !g.season_type || g.season_type === seasonTypeFilter
  );

  // 날짜별 경기 수 맵 (달력용)
  const gameDayMap: Record<string, number> = {};
  seasonFilteredGames.forEach((g) => {
    const key = format(new Date(g.start_time), "yyyy-MM-dd");
    gameDayMap[key] = (gameDayMap[key] || 0) + 1;
  });

  // 달력 날짜 클릭
  const handleCalendarDay = (dateStr: string) => {
    const d = new Date(dateStr);
    setFilterMonth(format(d, "MM"));
    setFilterDay(String(d.getDate()));
    setCalendarOpen(false);
  };
  useEffect(() => {
    if (!filterMonth) {
      setDaysWithGames([]);
      setFilterDay(null);
      setGameResults(seasonFilteredGames);
      return;
    }
    const monthGames = seasonFilteredGames.filter((g) => {
      return format(new Date(g.start_time), "MM") === filterMonth;
    });
    const days = Array.from(
      new Set(monthGames.map((g) => new Date(g.start_time).getDate()))
    ).sort((a, b) => a - b);
    setDaysWithGames(days);
    setFilterDay(null);
    setGameResults(monthGames);
  }, [filterMonth, allSeasonGames, seasonTypeFilter]);

  // 날짜 선택 시 필터링
  useEffect(() => {
    if (!filterMonth) return;
    if (filterDay === null) {
      setGameResults(seasonFilteredGames.filter((g) => format(new Date(g.start_time), "MM") === filterMonth));
    } else {
      setGameResults(seasonFilteredGames.filter((g) => {
        const d = new Date(g.start_time);
        return format(d, "MM") === filterMonth && d.getDate() === Number(filterDay);
      }));
    }
  }, [filterDay]);

  return (
    <>
      {/* 한 줄: 시즌 + 정규/POST + 월 스와이프 */}
      {(() => {
        const months = seasonTypeFilter === "regular"
          ? ["10","11","12","01","02","03","04"]
          : ["04","05","06"];
        const labels: Record<string, string> = { "01":"1월","02":"2월","03":"3월","04":"4월","05":"5월","06":"6월","10":"10월","11":"11월","12":"12월" };
        return (
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", overflowX: "auto", scrollbarWidth: "none" }}>
            <select className="filter-select" style={{ flexShrink: 0, maxWidth: 110, fontSize: 12, padding: "5px 6px" }}
              value={selectedSeason ?? ""}
              onChange={(e) => setSelectedSeason(Number(e.target.value))}>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.is_active ? "🟢" : "🔴"} {s.name.replace(" Season", "")}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0 }}>
              {(["regular", "post"] as const).map((type) => (
                <button key={type}
                  onClick={() => { setSeasonTypeFilter(type); setFilterMonth(null); setFilterDay(null); }}
                  style={{
                    padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                    background: seasonTypeFilter === type ? "var(--accent)" : "var(--surface2)",
                    color: seasonTypeFilter === type ? "#fff" : "var(--text-muted)",
                  }}>
                  {type === "regular" ? "정규" : "POST"}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

            {months.map((m) => (
              <button key={m}
                onClick={() => setFilterMonth(filterMonth === m ? null : m)}
                style={{
                  flexShrink: 0, padding: "5px 10px", borderRadius: 20,
                  background: filterMonth === m ? "var(--accent)" : "var(--surface2)",
                  color: filterMonth === m ? "#fff" : "var(--text-muted)",
                  border: filterMonth === m ? "none" : "1px solid var(--border)",
                  fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.15s",
                }}>
                {labels[m]}
              </button>
            ))}

            {/* 달력 버튼 */}
            <button
              onClick={() => setCalendarOpen(!calendarOpen)}
              style={{
                marginLeft: "auto", flexShrink: 0, width: 32, height: 32,
                borderRadius: 8, border: "1px solid var(--border)",
                background: calendarOpen ? "var(--accent)" : "var(--surface2)",
                color: calendarOpen ? "#fff" : "var(--text-muted)",
                cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              📅
            </button>
          </div>
        );
      })()}

      {/* 달력 패널 */}
      {calendarOpen && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", padding: "12px", marginBottom: 10,
        }}>
          {/* 달력 헤더 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 14 }}>
              ‹
            </button>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
              {calendarMonth.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}
            </span>
            <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 14 }}>
              ›
            </button>
          </div>

          {/* 요일 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {["일","월","화","수","목","금","토"].map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", fontWeight: 600, padding: "2px 0" }}>{d}</div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {(() => {
              const year = calendarMonth.getFullYear();
              const month = calendarMonth.getMonth();
              const firstDow = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const cells = [];

              for (let i = 0; i < firstDow; i++) {
                cells.push(<div key={`empty-${i}`} />);
              }

              for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const cnt = gameDayMap[dateStr] || 0;
                const isSelected = filterDay === String(d) && filterMonth === String(month + 1).padStart(2, "0");
                cells.push(
                  <div key={d}
                    onClick={() => cnt > 0 ? handleCalendarDay(dateStr) : undefined}
                    style={{
                      textAlign: "center", padding: "4px 2px", borderRadius: 8,
                      cursor: cnt > 0 ? "pointer" : "default",
                      background: isSelected ? "var(--accent)" : "transparent",
                      transition: "background 0.15s",
                      minHeight: 44, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 2,
                      opacity: cnt === 0 ? 0.25 : 1,
                    }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? "#fff" : "var(--text)", lineHeight: 1 }}>{d}</span>
                    {cnt > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 600, color: isSelected ? "#fff" : "var(--accent)", letterSpacing: 0.3 }}>
                        {cnt}G
                      </span>
                    )}
                  </div>
                );
              }
              return cells;
            })()}
          </div>
        </div>
      )}

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