// src/app/admin/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { format, addDays } from "date-fns";
import { User, Season, Round, ROUND_POINTS } from "@/lib/types";
import { getTeamLogoUrl } from "@/lib/nba-api";

interface Game {
  id: number;
  season_id: number;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  start_time: string;
  round: Round;
  winner: "home" | "away" | null;
  external_id: string | null;
  vote_deadline?: string;
  season_type?: "regular" | "post";
}

type AdminTab = "users" | "games" | "seasons";

const ROUNDS: Round[] = ["Play-In", "First Round", "Semifinals", "Conf. Finals", "Finals"];

// NBA 팀 - 한글명, 영문 약어, 컨퍼런스 포함
const NBA_TEAMS_KO = [
  // 동부 컨퍼런스 (ㄱㄴㄷ 정렬)
  { ko: "뉴올리언스 펠리컨스", en: "New Orleans Pelicans", abbr: "NOP", conf: "west" },
  { ko: "뉴욕 닉스", en: "New York Knicks", abbr: "NYK", conf: "east" },
  { ko: "댈러스 매버릭스", en: "Dallas Mavericks", abbr: "DAL", conf: "west" },
  { ko: "덴버 너기츠", en: "Denver Nuggets", abbr: "DEN", conf: "west" },
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

  // 커스텀 시간 picker 상태 (오전/오후, 시, 분)
  function parseDatetimeLocal(val: string) {
    // val: "yyyy-MM-ddTHH:mm"
    const [datePart, timePart] = val.split("T");
    const [hStr, mStr] = (timePart || "08:00").split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return { datePart, ampm, hour: h12, minute: m };
  }
  function buildDatetimeLocal(datePart: string, ampm: string, hour: number, minute: number) {
    let h24 = hour % 12;
    if (ampm === "PM") h24 += 12;
    return `${datePart}T${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  // ESPN 연동
  const [espnStartDate, setEspnStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [espnEndDate, setEspnEndDate] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [espnLoading, setEspnLoading] = useState(false);
  const [espnResult, setEspnResult] = useState<string>("");
  const [espnLastSync, setEspnLastSync] = useState<string>("");
  const [gradeLoading, setGradeLoading] = useState(false);
  // 채점 완료 경기 섹션 접기/펼치기 (기본: 접힘)
  const [completedSectionOpen, setCompletedSectionOpen] = useState(false);
  // 경기 추가 폼 접기/펼치기 (기본: 접힘)
  const [addGameOpen, setAddGameOpen] = useState(false);

  // 경기 목록 필터 - 월 선택 + 날짜 선택
  const currentYear = new Date().getFullYear();
  const [filterMonth, setFilterMonth] = useState(format(new Date(), "MM"));
  const [filterDay, setFilterDay] = useState<string | null>(null);
  const [gamePage, setGamePage] = useState(1);
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [daysWithGames, setDaysWithGames] = useState<number[]>([]);
  const [completedSeasonType, setCompletedSeasonType] = useState<"regular" | "post">(() => {
    const month = new Date().getMonth() + 1;
    return month >= 4 ? "post" : "regular";
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [endSeasonInput, setEndSeasonInput] = useState<Record<number, string>>({});
  const [calendarMonth, setCalendarMonth] = useState(new Date());

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
      if (active) {
        setNewGame((g) => ({ ...g, season_id: active.id }));
        if (active.last_espn_sync) setEspnLastSync(active.last_espn_sync);
      }
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
  // 달력용 날짜별 경기 수
  const gameDayMap: Record<string, number> = {};
  allGames.filter(g => !g.season_type || g.season_type === completedSeasonType).forEach((g) => {
    const key = format(new Date(g.start_time), "yyyy-MM-dd");
    gameDayMap[key] = (gameDayMap[key] || 0) + 1;
  });

  const handleAdminCalendarDay = (dateStr: string) => {
    const d = new Date(dateStr);
    setFilterMonth(format(d, "MM"));
    setFilterDay(String(d.getDate()));
    setCalendarOpen(false);
    setGamePage(1);
  };

  const filteredGames = allGames.filter((g) => {
    if (g.season_type && g.season_type !== completedSeasonType) return false;
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

  const syncESPN = async () => {
    if (espnLoading) return;
    setEspnLoading(true);
    setEspnResult("");
    const activeSeasonId = seasons.find((s) => s.is_active)?.id;
    if (!activeSeasonId) {
      setEspnResult("❌ 활성 시즌이 없습니다");
      setEspnLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/games/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: espnStartDate,
          endDate: espnEndDate,
          seasonId: activeSeasonId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const parts = [];
        if (json.inserted > 0) parts.push(`신규 ${json.inserted}경기`);
        if (json.updated > 0) parts.push(`업데이트 ${json.updated}경기`);
        if (json.unchanged > 0) parts.push(`변경없음 ${json.unchanged}경기`);
        const resultMsg = parts.join(" · ") || "변경 없음";
        setEspnResult(`✅ ${resultMsg} (총 ${json.total}경기 확인)`);
        const today = format(new Date(), "yyyy-MM-dd");
        setEspnLastSync(today);
        const activeSeasonId = seasons.find((s) => s.is_active)?.id;
        if (activeSeasonId) {
          await supabase.from("seasons").update({ last_espn_sync: today }).eq("id", activeSeasonId);
        }
        loadData();
      } else {
        setEspnResult(`❌ 오류: ${json.error}`);
      }
    } catch (e) {
      setEspnResult(`❌ 네트워크 오류`);
    }
    setEspnLoading(false);
  };

  const gradeGamesAuto = async () => {
    if (gradeLoading) return;
    setGradeLoading(true);
    try {
      const res = await fetch("/api/games/grade", {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        showToast(`✅ ${json.graded}경기 자동채점 완료`);
        loadData();
      } else {
        showToast(`❌ 오류: ${json.error}`);
      }
    } catch {
      showToast("❌ 네트워크 오류");
    }
    setGradeLoading(false);
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
    // KST(UTC+9) 기준 오늘 자정까지 (미래 경기 제외)
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const kstDateStr = kstNow.toISOString().slice(0, 10);
    const todayEnd = new Date(kstDateStr + "T23:59:59+09:00");
    supabase.from("games").select("*").is("winner", null).lte("start_time", todayEnd.toISOString()).order("start_time", { ascending: true })
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
              {/* ESPN 경기 가져오기 */}
              <div className="card" style={{ marginBottom: 12, overflow: "visible" }}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>
                  🏀 경기 자동 등록
                </div>

                {/* 날짜 범위 2열 */}
                <div style={{ display: "flex", gap: 8 }}>
                  <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                    <label className="form-label">시작일</label>
                    <input type="date" className="text-input"
                      value={espnStartDate}
                      onChange={(e) => setEspnStartDate(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                    <label className="form-label">종료일</label>
                    <input type="date" className="text-input"
                      value={espnEndDate}
                      onChange={(e) => setEspnEndDate(e.target.value)} />
                  </div>
                </div>

                {/* 권장 문구 + 마지막 실행 날짜 뱃지 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                    * 월 단위 등록을 권장합니다.
                  </p>
                  {espnLastSync && (
                    <span style={{
                      border: "1.5px solid #39ff6a",
                      borderRadius: 20,
                      padding: "2px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#39ff6a",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}>
                      {espnLastSync}
                    </span>
                  )}
                </div>

                {/* 경기 가져오기 + 자동채점 2열 */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primary" style={{ flex: 1 }}
                    onClick={syncESPN} disabled={espnLoading}>
                    {espnLoading ? "가져오는 중..." : "경기 가져오기"}
                  </button>
                  <button className="btn-primary" style={{ flex: 1, background: "var(--accent2)" }}
                    onClick={gradeGamesAuto} disabled={gradeLoading}>
                    {gradeLoading ? "채점 중..." : "⚡ 자동채점 실행"}
                  </button>
                </div>

                {espnResult && (
                  <div style={{
                    marginTop: 10, padding: "8px 12px", borderRadius: 8,
                    background: espnResult.startsWith("✅") ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                    color: espnResult.startsWith("✅") ? "var(--green)" : "var(--red)",
                    fontSize: 13, fontWeight: 600,
                  }}>
                    {espnResult}
                  </div>
                )}
              </div>

              {/* 경기 추가 폼 - 접기/펼치기 */}
              <div style={{
                border: "1px solid var(--border)", borderRadius: 10,
                background: "var(--surface)", marginBottom: 12,
              }}>
                <div
                  onClick={() => setAddGameOpen((v) => !v)}
                  style={{
                    fontWeight: 700, fontSize: 14, padding: "10px 14px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: "pointer", userSelect: "none",
                    borderBottom: addGameOpen ? "1px solid var(--border)" : "none",
                  }}>
                  <span>경기 추가</span>
                  <span style={{ fontSize: 20, color: "var(--text-muted)", lineHeight: 1 }}>
                    {addGameOpen ? "−" : "+"}
                  </span>
                </div>

                {addGameOpen && (
                  <div style={{ padding: "14px 16px" }}>
                    {/* 홈팀 / 원정팀 - 모바일에서 세로, PC에서 가로 */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <div className="form-group" style={{ flex: "1 1 140px", minWidth: 0 }}>
                        <label className="form-label">홈팀</label>
                        <select className="filter-select" style={{ width: "100%" }}
                          value={newGame.home_team}
                          onChange={(e) => setNewGame({ ...newGame, home_team: e.target.value })}>
                          <optgroup label="── 동부 ──">
                            {EAST_TEAMS.map((t) => <option key={t.en} value={t.en}>{t.ko} ({t.abbr})</option>)}
                          </optgroup>
                          <optgroup label="── 서부 ──">
                            {WEST_TEAMS.map((t) => <option key={t.en} value={t.en}>{t.ko} ({t.abbr})</option>)}
                          </optgroup>
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: "1 1 140px", minWidth: 0 }}>
                        <label className="form-label">원정팀</label>
                        <select className="filter-select" style={{ width: "100%" }}
                          value={newGame.away_team}
                          onChange={(e) => setNewGame({ ...newGame, away_team: e.target.value })}>
                          <optgroup label="── 동부 ──">
                            {EAST_TEAMS.map((t) => <option key={t.en} value={t.en}>{t.ko} ({t.abbr})</option>)}
                          </optgroup>
                          <optgroup label="── 서부 ──">
                            {WEST_TEAMS.map((t) => <option key={t.en} value={t.en}>{t.ko} ({t.abbr})</option>)}
                          </optgroup>
                        </select>
                      </div>
                    </div>

                    {/* 시작시간 / 마감시간 */}
                    {(["start_time", "vote_deadline"] as const).map((field) => {
                      const label = field === "start_time" ? "경기 시작시간" : "투표 마감시간";
                      const { datePart, ampm, hour, minute } = parseDatetimeLocal(newGame[field]);
                      const setField = (dp: string, ap: string, h: number, m: number) =>
                        setNewGame({ ...newGame, [field]: buildDatetimeLocal(dp, ap, h, m) });
                      return (
                        <div key={field} className="form-group">
                          <label className="form-label">{label}</label>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {/* 날짜 */}
                            <input type="date" className="text-input" style={{ flex: 2, minWidth: 0 }}
                              value={datePart}
                              onChange={(e) => setField(e.target.value, ampm, hour, minute)} />
                            {/* 오전/오후 */}
                            <select className="filter-select" style={{ flex: 1, minWidth: 0 }}
                              value={ampm}
                              onChange={(e) => setField(datePart, e.target.value, hour, minute)}>
                              <option value="AM">오전</option>
                              <option value="PM">오후</option>
                            </select>
                            {/* 시 */}
                            <select className="filter-select" style={{ flex: 1, minWidth: 0 }}
                              value={hour}
                              onChange={(e) => setField(datePart, ampm, Number(e.target.value), minute)}>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                                <option key={h} value={h}>{h}시</option>
                              ))}
                            </select>
                            {/* 분 */}
                            <select className="filter-select" style={{ flex: 1, minWidth: 0 }}
                              value={minute}
                              onChange={(e) => setField(datePart, ampm, hour, Number(e.target.value))}>
                              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                                <option key={m} value={m}>{String(m).padStart(2, "0")}분</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}

                    {/* 라운드 */}
                    <div className="form-group">
                      <label className="form-label">라운드</label>
                      <select className="filter-select" style={{ width: "100%" }}
                        value={newGame.round}
                        onChange={(e) => setNewGame({ ...newGame, round: e.target.value as Round })}>
                        {ROUNDS.map((r) => <option key={r} value={r}>{r} ({ROUND_POINTS[r]}점)</option>)}
                      </select>
                    </div>

                    <button className="btn-primary" style={{ width: "100%" }} onClick={addGame}>
                      경기 추가
                    </button>
                  </div>
                )}
              </div>

              {/* 채점 대기 경기 */}
              {pendingGames.length > 0 && (
                <>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, marginTop: 4 }}>
                    ⏳ 채점 대기 ({pendingGames.length}경기)
                  </div>
                  {pendingGames.map((game) => {
                    const isRegular = !ROUND_POINTS[game.round];
                    const pts = ROUND_POINTS[game.round];
                    return (
                      <div key={game.id} className="game-card-compact">
                        {/* 투표페이지와 동일한 팀 로고 레이아웃 */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>

                          {/* 왼쪽: 라운드/포인트 */}
                          <div style={{ width: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {!isRegular && (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                <span style={{ fontSize: 9, color: "var(--accent)", fontWeight: 700, textAlign: "center", lineHeight: 1.3, whiteSpace: "pre-wrap", wordBreak: "keep-all" }}>
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

                          {/* 홈팀: 삭제+승버튼(바깥) | 로고(VS쪽) */}
                          <div style={{ flex: 1, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                              <button onClick={() => deleteGame(game.id)}
                                style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                                삭제
                              </button>
                              <button
                                onClick={() => gradeGame(game.id, "home")}
                                style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid rgba(34,197,94,0.5)", background: "rgba(34,197,94,0.1)", color: "var(--green)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                승
                              </button>
                            </div>
                            <img
                              src={getTeamLogoUrl(game.home_team)} alt={game.home_team}
                              style={{ width: 56, height: 56, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 1px 6px rgba(0,0,0,0.5))" }}
                              onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                            />
                          </div>

                          {/* 가운데 VS 메타블록 */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, flexShrink: 0, minWidth: 72 }}>
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {format(new Date(game.start_time), "M/d HH:mm")}
                            </span>
                            <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--text-muted)", lineHeight: 1.1 }}>
                              VS
                            </span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>채점 대기</span>
                          </div>

                          {/* 원정팀: 로고(VS쪽) | 승버튼(바깥) */}
                          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 6 }}>
                            <img
                              src={getTeamLogoUrl(game.away_team)} alt={game.away_team}
                              style={{ width: 56, height: 56, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 1px 6px rgba(0,0,0,0.5))" }}
                              onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                            />
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                              {/* 삭제 자리 맞춤용 빈 공간 */}
                              <div style={{ height: 22 }} />
                              <button
                                onClick={() => gradeGame(game.id, "away")}
                                style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid rgba(59,130,246,0.5)", background: "rgba(59,130,246,0.1)", color: "var(--accent2)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                승
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* 채점 완료 경기 - 월/일 필터 */}
              <div
                onClick={() => setCompletedSectionOpen((v) => !v)}
                style={{
                  fontWeight: 700, fontSize: 14, marginTop: 8, marginBottom: 4,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", userSelect: "none",
                  padding: "10px 14px", borderRadius: 10,
                  border: "1px solid var(--border)", background: "var(--surface)",
                }}>
                <span>채점 완료 경기</span>
                <span style={{ fontSize: 20, color: "var(--text-muted)", lineHeight: 1 }}>
                  {completedSectionOpen ? "−" : "+"}
                </span>
              </div>

              {completedSectionOpen && <>

              {/* history 스타일 필터 바 */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, marginBottom: 8, overflowX: "auto", scrollbarWidth: "none" }}>
                <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0 }}>
                  {(["regular", "post"] as const).map((type) => (
                    <button key={type}
                      onClick={() => { setCompletedSeasonType(type); setFilterMonth(format(new Date(), "MM")); setFilterDay(null); setGamePage(1); }}
                      style={{ padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                        background: completedSeasonType === type ? "var(--accent)" : "var(--surface2)",
                        color: completedSeasonType === type ? "#fff" : "var(--text-muted)" }}>
                      {type === "regular" ? "정규" : "POST"}
                    </button>
                  ))}
                </div>
                <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />
                {(completedSeasonType === "regular"
                  ? ["10","11","12","01","02","03","04"]
                  : ["04","05","06"]
                ).map((m) => {
                  const labels: Record<string,string> = {"01":"1월","02":"2월","03":"3월","04":"4월","05":"5월","06":"6월","10":"10월","11":"11월","12":"12월"};
                  return (
                    <button key={m} onClick={() => { setFilterMonth(m); setFilterDay(null); setGamePage(1); }}
                      style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 20,
                        background: filterMonth === m ? "var(--accent)" : "var(--surface2)",
                        color: filterMonth === m ? "#fff" : "var(--text-muted)",
                        border: filterMonth === m ? "none" : "1px solid var(--border)",
                        fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                      {labels[m]}
                    </button>
                  );
                })}
                <button onClick={() => setCalendarOpen(!calendarOpen)}
                  style={{ marginLeft: "auto", flexShrink: 0, width: 32, height: 32, borderRadius: 8,
                    border: "1.5px solid var(--accent)",
                    background: calendarOpen ? "var(--accent)" : "rgba(99,102,241,0.15)",
                    color: calendarOpen ? "#fff" : "var(--accent)",
                    cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  📅
                </button>
              </div>

              {/* 달력 패널 */}
              {calendarOpen && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()-1, 1))}
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 14 }}>‹</button>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                      {calendarMonth.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}
                    </span>
                    <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()+1, 1))}
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 14 }}>›</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
                    {["일","월","화","수","목","금","토"].map(d => (
                      <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", fontWeight: 600, padding: "2px 0" }}>{d}</div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                    {(() => {
                      const year = calendarMonth.getFullYear();
                      const month = calendarMonth.getMonth();
                      const firstDow = new Date(year, month, 1).getDay();
                      const daysInMonth = new Date(year, month+1, 0).getDate();
                      const cells = [];
                      for (let i = 0; i < firstDow; i++) cells.push(<div key={`e-${i}`} />);
                      for (let d = 1; d <= daysInMonth; d++) {
                        const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                        const cnt = gameDayMap[dateStr] || 0;
                        const isSel = filterDay === String(d) && filterMonth === String(month+1).padStart(2,"0");
                        cells.push(
                          <div key={d} onClick={() => cnt > 0 ? handleAdminCalendarDay(dateStr) : undefined}
                            style={{ textAlign: "center", padding: "4px 2px", borderRadius: 8, cursor: cnt > 0 ? "pointer" : "default",
                              background: isSel ? "var(--accent)" : "transparent", minHeight: 44,
                              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                              opacity: cnt === 0 ? 0.25 : 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: isSel ? "#fff" : "var(--text)", lineHeight: 1 }}>{d}</span>
                            {cnt > 0 && <span style={{ fontSize: 9, fontWeight: 600, color: isSel ? "#fff" : "var(--accent)" }}>{cnt}</span>}
                          </div>
                        );
                      }
                      return cells;
                    })()}
                  </div>
                </div>
              )}

              {/* 일 선택 버튼 */}
              {daysWithGames.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  <button onClick={() => { setFilterDay(null); setGamePage(1); }}
                    style={{ padding: "5px 14px", borderRadius: 20, background: filterDay === null ? "var(--accent2)" : "var(--surface2)", color: filterDay === null ? "#fff" : "var(--text-muted)", border: filterDay === null ? "none" : "1px solid var(--border)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    전체
                  </button>
                  {daysWithGames.map((day) => (
                    <button key={day} onClick={() => { setFilterDay(String(day)); setGamePage(1); }}
                      style={{ padding: "5px 12px", borderRadius: 20, background: filterDay === String(day) ? "var(--accent2)" : "var(--surface2)", color: filterDay === String(day) ? "#fff" : "var(--text)", border: filterDay === String(day) ? "none" : "1px solid var(--border)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                      {day}일
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
                    <div key={game.id} className="card" style={{ padding: "8px 10px" }}>
                      {/* 3컬럼: 좌(라운드/시간) | 중(팀명) | 우(채점완료+삭제 / 승선택) */}
                      <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>

                        {/* 좌: 라운드 + 날짜시간 */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, flexShrink: 0, minWidth: 56 }}>
                          <span style={{ fontSize: 10, background: "rgba(99,102,241,0.15)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 4, padding: "1px 5px", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>
                            {game.round}
                          </span>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                            {format(new Date(game.start_time), "M/d HH:mm")}
                          </span>
                        </div>

                        {/* 중: 팀명 vs 팀명 */}
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12, fontWeight: 600 }}>
                          <span>{getTeamAbbr(game.home_team)}</span>
                          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>vs</span>
                          <span>{getTeamAbbr(game.away_team)}</span>
                        </div>

                        {/* 우: 위(채점완료+삭제) / 아래(승선택) */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                          {/* 윗줄: 채점완료 + 삭제 */}
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            {game.winner && <span className="badge badge-correct" style={{ fontSize: 10 }}>채점완료</span>}
                            <button onClick={() => deleteGame(game.id)}
                              style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>
                              삭제
                            </button>
                          </div>
                          {/* 아랫줄: 승 선택 버튼 */}
                          {regradeGameId !== game.id ? (
                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                onClick={() => game.winner ? setRegradeGameId(game.id) : resetAndRegrade(game.id, "home")}
                                style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                                  background: game.winner === "home" ? "rgba(34,197,94,0.2)" : "var(--surface2)",
                                  color: game.winner === "home" ? "var(--green)" : "var(--text-muted)",
                                  border: game.winner === "home" ? "1px solid rgba(34,197,94,0.4)" : "1px solid var(--border)" }}>
                                {getTeamAbbr(game.home_team)}{game.winner === "home" ? " ✓" : ""}
                              </button>
                              <button
                                onClick={() => game.winner ? setRegradeGameId(game.id) : resetAndRegrade(game.id, "away")}
                                style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                                  background: game.winner === "away" ? "rgba(59,130,246,0.2)" : "var(--surface2)",
                                  color: game.winner === "away" ? "var(--accent2)" : "var(--text-muted)",
                                  border: game.winner === "away" ? "1px solid rgba(59,130,246,0.4)" : "1px solid var(--border)" }}>
                                {getTeamAbbr(game.away_team)}{game.winner === "away" ? " ✓" : ""}
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                              <div style={{ fontSize: 10, color: "var(--gold)" }}>⚠️ 재채점</div>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(34,197,94,0.2)", color: "var(--green)", border: "1px solid rgba(34,197,94,0.4)", whiteSpace: "nowrap" }}
                                  onClick={() => resetAndRegrade(game.id, "home")}>
                                  {getTeamAbbr(game.home_team)}
                                </button>
                                <button style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(59,130,246,0.1)", color: "var(--accent2)", border: "1px solid rgba(59,130,246,0.2)", whiteSpace: "nowrap" }}
                                  onClick={() => resetAndRegrade(game.id, "away")}>
                                  {getTeamAbbr(game.away_team)}
                                </button>
                              </div>
                              <button style={{ fontSize: 10, color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                                onClick={() => setRegradeGameId(null)}>취소</button>
                            </div>
                          )}
                        </div>

                      </div>
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
              </>}

            </>
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
                <div key={s.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: s.is_active ? 10 : 0 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {format(new Date(s.started_at), "yyyy년 M월 d일")} 시작
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {s.is_active && <span className="badge badge-correct">활성</span>}
                    </div>
                  </div>
                  {s.is_active && (
                    <div>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                        시즌을 종료하려면 <strong style={{ color: "#ef4444" }}>시즌종료</strong>를 입력하세요.
                      </p>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          type="text"
                          className="text-input"
                          placeholder="시즌종료"
                          value={endSeasonInput[s.id] || ""}
                          onChange={(e) => setEndSeasonInput((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          style={{ flex: 1, fontSize: 13 }}
                        />
                        <button
                          onClick={() => {
                            if (endSeasonInput[s.id] === "시즌종료") {
                              endSeason(s.id);
                              setEndSeasonInput((prev) => ({ ...prev, [s.id]: "" }));
                            } else {
                              showToast("⚠️ '시즌종료'를 정확히 입력해주세요.");
                            }
                          }}
                          style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "4px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                          종료
                        </button>
                      </div>
                    </div>
                  )}
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