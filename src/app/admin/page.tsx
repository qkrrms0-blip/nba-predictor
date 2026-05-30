// src/app/admin/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { format, addDays } from "date-fns";
import { User, Season, Game, Round, ROUND_POINTS } from "@/lib/types";

type AdminTab = "users" | "games" | "seasons";

const ROUNDS: Round[] = ["Play-In", "First Round", "Semifinals", "Conf. Finals", "Finals"];

// NBA 팀 - 한글명, 영문 약어, 컨퍼런스 포함
const NBA_TEAMS_KO = [
  // 동부 컨퍼런스 (ㄱㄴㄷ 정렬)
  { ko: "뉴올리언스 펠리컨스", en: "New Orleans Pelicans", abbr: "NOP", conf: "west" },
  { ko: "뉴욕 닉스", en: "New York Knicks", abbr: "NYK", conf: "east" },
  { ko: "댈러스 매버릭스", en: "Dallas Mavericks", abbr: "DAL", conf: "west" },
  { ko: "덴버 너기츠", en: "Denver Nuggets", abbr: "DEN", conf: "west" },
  { ko: "デトロイ트 피스톤스", en: "Detroit Pistons", abbr: "DET", conf: "east" },
  { ko: "디트로이트 피스톤스", en: "Detroit Pistons", abbr: "DET", conf: "east" },
  { ko: "LA 클리퍼스", en: "LA Clippers", abbr: "LAC", conf: "west" },
  { ko: "LA 레이커스", en: "Los Angeles Lakers", abbr: "LAL", conf: "west" },
  { ko: "멤피스 그리즐리스", en: "Memphis Grizzlies", abbr: "MEM", conf: "west" },
  { ko: "마이애미 히트", en: "Miami Heat", abbr: "MIA", conf: "east" },
  { ko: "밀워키 벅스", en: "Milwaukee Bucks", abbr: "MIL", conf: "east" },
  { ko: "미네소타 팀버울브스", en: "Minnesota Timberwolves", abbr: "MIN", conf: "west" },
  { ko: "보스턴 셀틱스", en: "Boston Celtics", abbr: "BOS", conf: "east" },
  { ko: "브루클린 네츠", en: "Brooklyn Nets", abbr: "BKN", conf: "east" },
  { ko: "새크라멘토 킹스", en: "Sacramento Kings", abbr: "SAC", conf: "west" },
  { ko: "샌안토니오 스퍼스", en: "San Antonio Spurs", abbr: "SAS", conf: "west" },
  { ko: "샬럿 호네츠", en: "Charlotte Hornets", abbr: "CHA", conf: "east" },
  { ko: "시카고 불스", en: "Chicago Bulls", abbr: "CHI", conf: "east" },
  { ko: "애틀란타 호크스", en: "Atlanta Hawks", abbr: "ATL", conf: "east" },
  { ko: "오클라호마시티 선더", en: "Oklahoma City Thunder", abbr: "OKC", conf: "west" },
  { ko: "올랜도 매직", en: "Orlando Magic", abbr: "ORL", conf: "east" },
  { ko: "워싱턴 위저즈", en: "Washington Wizards", abbr: "WAS", conf: "east" },
  { ko: "유타 재즈", en: "Utah Jazz", abbr: "UTA", conf: "west" },
  { ko: "인디애나 페이서스", en: "Indiana Pacers", abbr: "IND", conf: "east" },
  { ko: "클리블랜드 캐벌리어스", en: "Cleveland Cavaliers", abbr: "CLE", conf: "east" },
  { ko: "토론토 랩터스", en: "Toronto Raptors", abbr: "TOR", conf: "east" },
  { ko: "포틀랜드 트레일블레이저스", en: "Portland Trail Blazers", abbr: "POR", conf: "west" },
  { ko: "피닉스 선스", en: "Phoenix Suns", abbr: "PHX", conf: "west" },
  { ko: "필라델피아 76ers", en: "Philadelphia 76ers", abbr: "PHI", conf: "east" },
  { ko: "골든스테이트 워리어스", en: "Golden State Warriors", abbr: "GSW", conf: "west" },
  { ko: "휴스턴 로키츠", en: "Houston Rockets", abbr: "HOU", conf: "west" },
];

// 중복 제거 및 ㄱㄴㄷ 정렬
const TEAMS = Array.from(
  new Map(NBA_TEAMS_KO.map((t) => [t.en, t])).values()
).sort((a, b) => a.ko.localeCompare(b.ko, "ko"));

const EAST_TEAMS = TEAMS.filter((t) => t.conf === "east");
const WEST_TEAMS = TEAMS.filter((t) => t.conf === "west");

// 다음날 오전 8시 KST
function defaultStartTime() {
  const d = addDays(new Date(), 1);
  d.setHours(8, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}
function defaultDeadline() {
  const d = addDays(new Date(), 1);
  d.setHours(8, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

const PLAYOFF_MONTHS = [
  { value: "04", label: "4월" },
  { value: "05", label: "5월" },
  { value: "06", label: "6월" },
];

const ITEMS_PER_PAGE = 10;

function TeamSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select
        className="filter-select"
        style={{ width: "100%" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <optgroup label="── 동부 컨퍼런스 ──">
          {EAST_TEAMS.map((t) => (
            <option key={t.en} value={t.en}>
              {t.ko} ({t.abbr})
            </option>
          ))}
        </optgroup>
        <optgroup label="── 서부 컨퍼런스 ──">
          {WEST_TEAMS.map((t) => (
            <option key={t.en} value={t.en}>
              {t.ko} ({t.abbr})
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

function getTeamKo(en: string) {
  return TEAMS.find((t) => t.en === en)?.ko || en;
}
function getTeamAbbr(en: string) {
  return TEAMS.find((t) => t.en === en)?.abbr || en;
}

export default function AdminPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<AdminTab>("games");
  const [users, setUsers] = useState<User[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  // 멤버 초대
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  // 경기 추가 폼
  const [newGame, setNewGame] = useState({
    home_team: TEAMS[0].en,
    away_team: TEAMS[1].en,
    start_time: defaultStartTime(),
    vote_deadline: defaultDeadline(),
    round: "First Round" as Round,
    season_id: 1,
  });

  // 채점 변경용
  const [regradeGameId, setRegradeGameId] = useState<number | null>(null);
  // 채점완료 경기 섹션 접기/펼치기 (기본: 접힘)
  const [completedSectionOpen, setCompletedSectionOpen] = useState(false);


  // 경기 목록 필터 - 월 선택 + 날짜 선택
  const currentYear = new Date().getFullYear();
  const [filterMonth, setFilterMonth] = useState(format(new Date(), "MM"));
  const [filterDay, setFilterDay] = useState<string | null>(null);
  const [gamePage, setGamePage] = useState(1);
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [daysWithGames, setDaysWithGames] = useState<number[]>([]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  useEffect(() => {
    loadData();
  }, [tab]);

  const loadData = async () => {
    setLoading(true);
    if (tab === "users") {
      const { data } = await supabase.from("users").select("*").order("created_at");
      setUsers(data || []);
    } else if (tab === "games") {
      const { data: seasonData } = await supabase.from("seasons").select("*").order("id");
      setSeasons(seasonData || []);
      const active = (seasonData || []).find((s: Season) => s.is_active);
      if (active) setNewGame((g) => ({ ...g, season_id: active.id }));
      await loadAllGames();
    } else if (tab === "seasons") {
      const { data } = await supabase.from("seasons").select("*").order("id");
      setSeasons(data || []);
    }
    setLoading(false);
  };

  const loadAllGames = async () => {
    const { data } = await supabase
      .from("games")
      .select("*")
      .not("winner", "is", null)
      .order("start_time", { ascending: false });
    setAllGames(data || []);
  };

  // 선택된 월의 경기 필터링
  useEffect(() => {
    if (!filterMonth) return;
    const monthGames = allGames.filter((g) => {
      const d = new Date(g.start_time);
      return format(d, "MM") === filterMonth;
    });
    const days = Array.from(new Set(monthGames.map((g) => new Date(g.start_time).getDate()))).sort((a, b) => a - b);
    setDaysWithGames(days);
    setFilterDay(null);
    setGamePage(1);
  }, [filterMonth, allGames]);

  // 표시할 경기 목록 계산
  const filteredGames = allGames.filter((g) => {
    const d = new Date(g.start_time);
    if (format(d, "MM") !== filterMonth) return false;
    if (filterDay !== null && d.getDate() !== Number(filterDay)) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredGames.length / ITEMS_PER_PAGE);
  const pagedGames = filteredGames.slice((gamePage - 1) * ITEMS_PER_PAGE, gamePage * ITEMS_PER_PAGE);

  const approveUser = async (userId: string, approve: boolean) => {
    if (!approve) {
      const { error } = await supabase.from("users").delete().eq("id", userId);
      if (!error) { showToast("🗑️ 멤버 삭제 완료"); loadData(); }
      return;
    }
    const { error } = await supabase.from("users").update({ approved: true }).eq("id", userId);
    if (!error) { showToast("✅ 승인 완료"); loadData(); }
  };

  const setAdmin = async (userId: string, isAdmin: boolean) => {
    const { error } = await supabase.from("users").update({ role: isAdmin ? "admin" : "user" }).eq("id", userId);
    if (!error) { showToast(isAdmin ? "관리자 권한 부여" : "일반 유저로 변경"); loadData(); }
  };

  const inviteUser = async () => {
    if (!inviteEmail || !inviteName) { showToast("이메일과 이름을 입력하세요"); return; }
    const { error } = await supabase.from("invited_emails").upsert({
      email: inviteEmail.trim().toLowerCase(),
      name: inviteName.trim(),
    }, { onConflict: "email" });
    if (error) {
      showToast("❌ 오류: " + error.message);
    } else {
      showToast("✅ 등록 완료! 해당 이메일로 Google 로그인하면 바로 투표 가능합니다.");
      setInviteEmail(""); setInviteName("");
    }
  };

  const addGame = async () => {
    if (newGame.home_team === newGame.away_team) {
      showToast("홈팀과 원정팀이 같습니다"); return;
    }
    const { error } = await supabase.from("games").insert({
      home_team: newGame.home_team,
      away_team: newGame.away_team,
      start_time: new Date(newGame.start_time).toISOString(),
      vote_deadline: new Date(newGame.vote_deadline).toISOString(),
      round: newGame.round,
      season_id: newGame.season_id,
    });
    if (error) { showToast("❌ 오류: " + error.message); }
    else { showToast("✅ 경기 추가 완료"); loadData(); }
  };

  const deleteGame = async (gameId: number) => {
    if (!confirm("이 경기를 삭제하시겠습니까? 관련 투표도 모두 삭제됩니다.")) return;
    await supabase.from("votes").delete().eq("game_id", gameId);
    const { error } = await supabase.from("games").delete().eq("id", gameId);
    if (error) { showToast("❌ 삭제 오류: " + error.message); }
    else { showToast("🗑️ 경기 삭제 완료"); loadAllGames(); }
  };

  const gradeGame = async (gameId: number, winner: "home" | "away") => {
    const { error } = await supabase.rpc("grade_votes", {
      p_game_id: gameId,
      p_winner: winner,
    });
    if (error) { showToast("❌ 채점 오류: " + error.message); }
    else { showToast("✅ 채점 완료"); setRegradeGameId(null); loadAllGames(); }
  };

  const resetAndRegrade = async (gameId: number, winner: "home" | "away") => {
    await supabase.from("votes").update({ is_correct: null, points: null }).eq("game_id", gameId);
    await supabase.from("games").update({ winner: null }).eq("id", gameId);
    await gradeGame(gameId, winner);
  };

  const endSeason = async (seasonId: number) => {
    // 미정산(winner=null) 경기가 있으면 종료 불가
    const { data: unsettled } = await supabase
      .from("games")
      .select("id")
      .eq("season_id", seasonId)
      .is("winner", null);
    if (unsettled && unsettled.length > 0) {
      showToast("❌ 미정산 경기가 " + unsettled.length + "개 있습니다. 정산 후 시즌종료 가능합니다");
      return;
    }
    if (!confirm("시즌을 종료하시겠습니까?")) return;
    const { error } = await supabase.from("seasons").update({ is_active: false }).eq("id", seasonId);
    if (!error) { showToast("시즌 종료 완료"); loadData(); }
  };

  const startNewSeason = async () => {
    const name = prompt("새 시즌 이름을 입력하세요 (예: 2025-26 Season)");
    if (!name) return;
    await supabase.from("seasons").update({ is_active: false }).eq("is_active", true);
    const { error } = await supabase.from("seasons").insert({ name, is_active: true });
    if (!error) { showToast("✅ 새 시즌 시작!"); loadData(); }
  };

  // 미채점 경기 (채점 대기 중) - 별도 로드
  const [pendingGames, setPendingGames] = useState<Game[]>([]);
  useEffect(() => {
    if (tab !== "games") return;
    supabase.from("games").select("*").is("winner", null).order("start_time", { ascending: false }).limit(30)
      .then(({ data }) => setPendingGames(data || []));
  }, [tab, allGames]);

  return (
    <>
      <h1 className="section-title">관리</h1>

      <div className="admin-tabs">
        {(["games", "users", "seasons"] as AdminTab[]).map((t) => (
          <button key={t} className={`admin-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "users" ? "사용자" : t === "games" ? "경기" : "시즌"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : (
        <>
          {/* ── 경기 관리 ── */}
          {tab === "games" && (
            <>
              {/* 경기 추가 폼 */}
              <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>+ 경기 추가</div>
                <TeamSelect
                  label="홈팀"
                  value={newGame.home_team}
                  onChange={(v) => setNewGame({ ...newGame, home_team: v })}
                />
                <TeamSelect
                  label="원정팀"
                  value={newGame.away_team}
                  onChange={(v) => setNewGame({ ...newGame, away_team: v })}
                />
                <div className="form-group">
                  <label className="form-label">경기 시작시간 (한국시간 기본: 내일 오전 8시)</label>
                  <input type="datetime-local" className="text-input"
                    value={newGame.start_time}
                    onChange={(e) => setNewGame({ ...newGame, start_time: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">투표 마감시간 (기본: 내일 오전 8시)</label>
                  <input type="datetime-local" className="text-input"
                    value={newGame.vote_deadline}
                    onChange={(e) => setNewGame({ ...newGame, vote_deadline: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">라운드</label>
                  <select className="filter-select" style={{ width: "100%" }}
                    value={newGame.round}
                    onChange={(e) => setNewGame({ ...newGame, round: e.target.value as Round })}>
                    {ROUNDS.map((r) => <option key={r} value={r}>{r} ({ROUND_POINTS[r]}점)</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">시즌</label>
                  <select className="filter-select" style={{ width: "100%" }}
                    value={newGame.season_id}
                    onChange={(e) => setNewGame({ ...newGame, season_id: Number(e.target.value) })}>
                    {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button className="btn-primary" style={{ width: "100%" }} onClick={addGame}>
                  경기 추가
                </button>
              </div>

              {/* 채점 대기 경기 */}
              {pendingGames.length > 0 && (
                <>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, marginTop: 4 }}>
                    ⏳ 채점 대기 ({pendingGames.length}경기)
                  </div>
                  {pendingGames.map((game) => (
                    <div key={game.id} className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {format(new Date(game.start_time), "M/d HH:mm")} · {game.round}
                        </span>
                        <button onClick={() => deleteGame(game.id)}
                          style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "2px 8px", fontSize: 12, cursor: "pointer" }}>
                          삭제
                        </button>
                      </div>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>
                        {getTeamKo(game.home_team)} ({getTeamAbbr(game.home_team)}) vs {getTeamKo(game.away_team)} ({getTeamAbbr(game.away_team)})
                      </div>
                      {regradeGameId !== game.id ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="action-btn btn-approve" style={{ flex: 1 }}
                            onClick={() => gradeGame(game.id, "home")}>
                            {getTeamAbbr(game.home_team)} 승
                          </button>
                          <button className="action-btn" style={{ flex: 1, background: "rgba(59,130,246,0.1)", color: "var(--accent2)", border: "1px solid rgba(59,130,246,0.2)" }}
                            onClick={() => gradeGame(game.id, "away")}>
                            {getTeamAbbr(game.away_team)} 승
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </>
              )}

              {/* 채점 완료 경기 - 월/일 필터 */}
              <div
                onClick={() => setCompletedSectionOpen((v) => !v)}
                style={{ fontWeight: 700, fontSize: 14, marginBottom: completedSectionOpen ? 10 : 4, marginTop: 8,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", userSelect: "none",
                  padding: "10px 14px", borderRadius: 10,
                  border: "1px solid var(--border)", background: "var(--surface)",
                }}>
                <span>채점 완료 경기</span>
                <span style={{ fontSize: 18, color: "var(--text-muted)", lineHeight: 1 }}>
                  {completedSectionOpen ? "−" : "+"}
                </span>
              </div>

              {completedSectionOpen && (<>

              {/* 월 선택 (원형 버튼) */}
              <div style={{ display: "flex", gap: 10, marginBottom: 12, justifyContent: "center" }}>
                {PLAYOFF_MONTHS.map((m) => (
                  <button key={m.value}
                    onClick={() => { setFilterMonth(m.value); setFilterDay(null); setGamePage(1); }}
                    style={{
                      width: 52, height: 52, borderRadius: "50%",
                      background: filterMonth === m.value ? "var(--accent)" : "var(--surface2)",
                      color: filterMonth === m.value ? "#fff" : "var(--text-muted)",
                      border: filterMonth === m.value ? "none" : "1px solid var(--border)",
                      fontWeight: 700, fontSize: 14, cursor: "pointer",
                      transition: "all 0.15s",
                    }}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* 날짜 선택 (경기 있는 날만 원형 버튼) */}
              {daysWithGames.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, justifyContent: "center" }}>
                  <button
                    onClick={() => { setFilterDay(null); setGamePage(1); }}
                    style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: filterDay === null ? "var(--accent2)" : "var(--surface2)",
                      color: filterDay === null ? "#fff" : "var(--text-muted)",
                      border: filterDay === null ? "none" : "1px solid var(--border)",
                      fontWeight: 600, fontSize: 12, cursor: "pointer",
                    }}>
                    전체
                  </button>
                  {daysWithGames.map((day) => (
                    <button key={day}
                      onClick={() => { setFilterDay(String(day)); setGamePage(1); }}
                      style={{
                        width: 40, height: 40, borderRadius: "50%",
                        background: filterDay === String(day) ? "var(--accent2)" : "var(--surface2)",
                        color: filterDay === String(day) ? "#fff" : "var(--text)",
                        border: filterDay === String(day) ? "none" : "1px solid var(--border)",
                        fontWeight: 600, fontSize: 12, cursor: "pointer",
                      }}>
                      {day}
                    </button>
                  ))}
                </div>
              )}

              {filteredGames.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📅</div>
                  <div className="empty-title">해당 기간 채점된 경기가 없습니다</div>
                </div>
              ) : (
                <>
                  {pagedGames.map((game) => (
                    <div key={game.id} className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {format(new Date(game.start_time), "M/d HH:mm")} · {game.round}
                        </span>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {game.winner && <span className="badge badge-correct">채점완료</span>}
                          <button onClick={() => deleteGame(game.id)}
                            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "2px 8px", fontSize: 12, cursor: "pointer" }}>
                            삭제
                          </button>
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>
                        {getTeamKo(game.home_team)} ({getTeamAbbr(game.home_team)}) vs {getTeamKo(game.away_team)} ({getTeamAbbr(game.away_team)})
                      </div>
                      {game.winner && regradeGameId !== game.id && (
                        <button
                          style={{ width: "100%", padding: "6px", background: "var(--surface2)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}
                          onClick={() => setRegradeGameId(game.id)}>
                          ✏️ 채점 변경 (현재: {game.winner === "home" ? getTeamAbbr(game.home_team) : getTeamAbbr(game.away_team)} 승)
                        </button>
                      )}
                      {regradeGameId === game.id && (
                        <div>
                          <div style={{ fontSize: 12, color: "var(--gold)", marginBottom: 8 }}>
                            ⚠️ 기존 채점을 초기화하고 재채점합니다
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="action-btn btn-approve" style={{ flex: 1 }}
                              onClick={() => resetAndRegrade(game.id, "home")}>
                              {getTeamAbbr(game.home_team)} 승으로 변경
                            </button>
                            <button className="action-btn" style={{ flex: 1, background: "rgba(59,130,246,0.1)", color: "var(--accent2)", border: "1px solid rgba(59,130,246,0.2)" }}
                              onClick={() => resetAndRegrade(game.id, "away")}>
                              {getTeamAbbr(game.away_team)} 승으로 변경
                            </button>
                          </div>
                          <button style={{ width: "100%", marginTop: 6, padding: "4px", background: "transparent", color: "var(--text-muted)", border: "none", fontSize: 12, cursor: "pointer" }}
                            onClick={() => setRegradeGameId(null)}>취소</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 페이지네이션 */}
                  {totalPages > 1 && (
                    <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
                      <button
                        onClick={() => setGamePage((p) => Math.max(1, p - 1))}
                        disabled={gamePage === 1}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: gamePage === 1 ? "var(--text-muted)" : "var(--text)", cursor: gamePage === 1 ? "default" : "pointer", fontSize: 13 }}>
                        ‹
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button key={p} onClick={() => setGamePage(p)}
                          style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: gamePage === p ? "var(--accent)" : "var(--surface2)", color: gamePage === p ? "#fff" : "var(--text)", cursor: "pointer", fontSize: 13, fontWeight: gamePage === p ? 700 : 400 }}>
                          {p}
                        </button>
                      ))}
                      <button
                        onClick={() => setGamePage((p) => Math.min(totalPages, p + 1))}
                        disabled={gamePage === totalPages}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: gamePage === totalPages ? "var(--text-muted)" : "var(--text)", cursor: gamePage === totalPages ? "default" : "pointer", fontSize: 13 }}>
                        ›
                      </button>
                    </div>
                  )}
                  <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                    총 {filteredGames.length}경기 · {gamePage}/{totalPages} 페이지
                  </div>
                </>
              )}
            </>
            </>)}
          )}

          {/* ── 사용자 관리 ── */}
          {tab === "users" && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>📧 멤버 직접 추가</div>
                <div className="form-group">
                  <label className="form-label">이름 (닉네임)</label>
                  <input type="text" className="text-input" placeholder="홍길동"
                    value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Google 이메일</label>
                  <input type="email" className="text-input" placeholder="example@gmail.com"
                    value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                </div>
                <button className="btn-primary" style={{ width: "100%" }} onClick={inviteUser}>
                  멤버 추가 (바로 승인)
                </button>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  * 해당 이메일로 Google 로그인하면 승인 없이 바로 투표 참여 가능합니다.
                </p>
              </div>

              <p className="section-subtitle">총 {users.length}명</p>
              {users.map((user) => (
                <div key={user.id} className="admin-user-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{user.email}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      {user.approved
                        ? <span style={{ color: "var(--green)" }}>✓ 승인됨</span>
                        : <span style={{ color: "var(--text-muted)" }}>대기 중</span>}
                      {user.role === "admin" && (
                        <span style={{ color: "var(--gold)", marginLeft: 6 }}>★ 관리자</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {/* 관리자 체크박스 */}
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", color: "var(--text-muted)" }}>
                      <input
                        type="checkbox"
                        checked={user.role === "admin"}
                        onChange={(e) => setAdmin(user.id, e.target.checked)}
                        style={{ width: 15, height: 15, cursor: "pointer" }}
                      />
                      관리자
                    </label>
                    {!user.approved ? (
                      <>
                        <button className="action-btn btn-approve" onClick={() => approveUser(user.id, true)}>승인</button>
                        <button className="action-btn btn-reject" onClick={() => approveUser(user.id, false)}>거절</button>
                      </>
                    ) : (
                      <button className="action-btn btn-reject" onClick={() => approveUser(user.id, false)}>승인취소</button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── 시즌 관리 ── */}
          {tab === "seasons" && (
            <>
              <button className="btn-primary" style={{ width: "100%", marginBottom: 16 }}
                onClick={startNewSeason}>
                🏆 새 시즌 시작
              </button>
              {seasons.map((s) => (
                <div key={s.id} className="card"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {format(new Date(s.started_at), "yyyy년 M월 d일")} 시작
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {s.is_active && <span className="badge badge-correct">활성</span>}
                    {s.is_active && (
                      <button onClick={() => endSeason(s.id)}
                        style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
                        시즌 종료
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}