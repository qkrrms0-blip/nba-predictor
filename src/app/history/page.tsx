// src/app/history/page.tsx
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import React from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { Season, ROUND_POINTS } from "@/lib/types";
import { getTeamLogoUrl } from "@/lib/nba-api";

interface GameResult {
  id: number;
  home_team: string;
  away_team: string;
  home_score?: number | null;
  away_score?: number | null;
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
  const [monthClicked, setMonthClicked] = useState(false); // 유저가 월을 직접 클릭했는지

  // 월 캐러셀
  const monthScrollRef = useRef<HTMLDivElement>(null);
  const [centeredMonthIndex, setCenteredMonthIndex] = useState(0);
  const isScrollingProgrammatically = useRef(false);

  // 페이지네이션
  const GAMES_PER_PAGE = 5;
  const [pageIndex, setPageIndex] = useState(0);
  const totalPagesRef = useRef(1);
  const wheelCooldown = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const mouseStartXPage = useRef<number | null>(null);

  // 월 캐러셀 마우스 드래그
  const monthMouseStartX = useRef<number | null>(null);
  const monthMouseStartScroll = useRef(0);

  // 일 캐러셀
  const dayScrollRef = useRef<HTMLDivElement>(null);
  const dayMouseStartX = useRef<number | null>(null);
  const dayMouseStartScroll = useRef(0);

  // 달력 버튼 ref (팝업 위치 계산용)
  const calendarBtnRef = useRef<HTMLButtonElement>(null);

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
    const month = new Date().getMonth() + 1;
    setSeasonTypeFilter(month >= 4 ? "post" : "regular");
  }, []);

  // 시즌 변경 시 전체 경기 로드
  useEffect(() => {
    if (selectedSeason === null) return;
    loadSeasonGames(selectedSeason);
  }, [selectedSeason]);

  const loadSeasonGames = async (seasonId: number, typeOverride?: "regular" | "post") => {
    setLoading(true);
    setFilterMonth(null);
    setFilterDay(null);
    setPageIndex(0);
    setMonthClicked(false);

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

    // 현재 seasonType 기준 필터링 후 최신 날짜 자동 선택
    const curType = typeOverride ?? seasonTypeFilter;
    const typeFiltered = results.filter((g) => !g.season_type || g.season_type === curType);
    autoSelectLatest(typeFiltered, curType, results);
    setLoading(false);
  };

  // 최신 경기 날짜로 월 캐러셀 위치만 자동 이동 (일 선택은 월 클릭 후)
  const autoSelectLatest = useCallback((typeFiltered: GameResult[], type: "regular" | "post", allResults?: GameResult[]) => {
    if (typeFiltered.length === 0) return;
    const latest = typeFiltered[0]; // 내림차순이므로 첫 번째가 최신
    const latestMonth = format(new Date(latest.start_time), "MM");
    const latestDay = String(new Date(latest.start_time).getDate());

    setFilterMonth(latestMonth);
    setFilterDay(latestDay);
    setPageIndex(0);

    // 월 캐러셀도 해당 월로 이동
    const monthList = type === "regular" ? ["10","11","12","01","02","03","04"] : ["04","05","06"];
    const idx = monthList.indexOf(latestMonth);
    if (idx >= 0) {
      setCenteredMonthIndex(idx);
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToIndex(idx)));
    }
  }, []);

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
    setMonthClicked(true);
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
    // filterDay가 없을 때만 자동으로 최신 날짜 선택
    setFilterDay((prev) => prev ?? (days.length > 0 ? String(days[days.length - 1]) : null));
    setGameResults(monthGames);
  }, [filterMonth, allSeasonGames, seasonTypeFilter]);

  // 날짜 선택 시 필터링
  useEffect(() => {
    setPageIndex(0);
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

  // ── 월 캐러셀 로직 ──────────────────────────────────
  const ITEM_W = 52;   // 중앙 버튼 너비
  const ITEM_SMALL = 40; // 좌우 버튼 너비
  const GAP = 8;

  const regularMonths = ["10","11","12","01","02","03","04"];
  const postMonths    = ["04","05","06"];
  const labels: Record<string, string> = {
    "01":"1월","02":"2월","03":"3월","04":"4월","05":"5월",
    "06":"6월","10":"10월","11":"11월","12":"12월",
  };

  const months = seasonTypeFilter === "regular" ? regularMonths : postMonths;

  // 캐러셀 스크롤 후 중앙 인덱스 감지
  const onMonthScroll = useCallback(() => {
    if (isScrollingProgrammatically.current) return;
    const el = monthScrollRef.current;
    if (!el) return;
    const containerCenter = el.scrollLeft + el.clientWidth / 2;
    let closestIdx = 0;
    let closestDist = Infinity;
    const items = el.querySelectorAll<HTMLElement>("[data-month-item]");
    items.forEach((item, i) => {
      const itemCenter = item.offsetLeft + item.offsetWidth / 2;
      const dist = Math.abs(itemCenter - containerCenter);
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    });
    setCenteredMonthIndex(closestIdx);
  }, []);

  // 특정 인덱스로 부드럽게 스크롤
  const scrollToIndex = useCallback((idx: number) => {
    const el = monthScrollRef.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>("[data-month-item]");
    const target = items[idx];
    if (!target) return;
    isScrollingProgrammatically.current = true;
    const targetCenter = target.offsetLeft + target.offsetWidth / 2;
    const scrollLeft = targetCenter - el.clientWidth / 2;
    el.scrollTo({ left: scrollLeft, behavior: "smooth" });
    setCenteredMonthIndex(idx);
    setTimeout(() => { isScrollingProgrammatically.current = false; }, 400);
  }, []);

  // seasonType 바뀔 때 해당 타입의 최신 경기 날짜로 자동 선택
  useEffect(() => {
    setFilterMonth(null);
    setFilterDay(null);
    setPageIndex(0);
    setMonthClicked(false);
    if (allSeasonGames.length === 0) return;
    const typeFiltered = allSeasonGames.filter((g) => !g.season_type || g.season_type === seasonTypeFilter);
    autoSelectLatest(typeFiltered, seasonTypeFilter);
  }, [seasonTypeFilter]);

  // 월 캐러셀 마우스 드래그 (PC)
  const handleMonthMouseDown = (e: React.MouseEvent) => {
    monthMouseStartX.current = e.clientX;
    monthMouseStartScroll.current = monthScrollRef.current?.scrollLeft ?? 0;
  };
  const handleMonthMouseMove = (e: React.MouseEvent) => {
    if (monthMouseStartX.current === null) return;
    const el = monthScrollRef.current;
    if (!el) return;
    el.scrollLeft = monthMouseStartScroll.current - (e.clientX - monthMouseStartX.current);
  };
  const handleMonthMouseUp = () => { monthMouseStartX.current = null; };

  // 일 캐러셀 마우스 드래그 (PC)
  const handleDayMouseDown = (e: React.MouseEvent) => {
    dayMouseStartX.current = e.clientX;
    dayMouseStartScroll.current = dayScrollRef.current?.scrollLeft ?? 0;
  };
  const handleDayMouseMove = (e: React.MouseEvent) => {
    if (dayMouseStartX.current === null) return;
    const el = dayScrollRef.current;
    if (!el) return;
    el.scrollLeft = dayMouseStartScroll.current - (e.clientX - dayMouseStartX.current);
  };
  const handleDayMouseUp = () => { dayMouseStartX.current = null; };

  // 페이지 네비게이션 — window 이벤트
  const goNext = useCallback(() => setPageIndex((p) => { const n = Math.min(p + 1, totalPagesRef.current - 1); return n; }), []);
  const goPrev = useCallback(() => setPageIndex((p) => Math.max(p - 1, 0)), []);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      const diff = touchStartX.current - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) diff > 0 ? goNext() : goPrev();
      touchStartX.current = null;
    };
    const onMouseDown = (e: MouseEvent) => { mouseStartXPage.current = e.clientX; };
    const onMouseUp = (e: MouseEvent) => {
      if (mouseStartXPage.current === null) return;
      const diff = mouseStartXPage.current - e.clientX;
      if (Math.abs(diff) > 40) diff > 0 ? goNext() : goPrev();
      mouseStartXPage.current = null;
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

  // 월 버튼 클릭
  const handleMonthClick = (m: string, idx: number) => {
    scrollToIndex(idx);
    setFilterMonth(filterMonth === m ? null : m);
    setFilterDay(null);
    setMonthClicked(true);
  };
  // ────────────────────────────────────────────────────

  return (
    <div style={{ userSelect: "none" }}>
      {/* ── 상단 고정 필터 바 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>

        {/* 시즌 select */}
        <select
          className="filter-select"
          style={{ flexShrink: 0, maxWidth: 110, fontSize: 12, padding: "5px 6px" }}
          value={selectedSeason ?? ""}
          onChange={(e) => setSelectedSeason(Number(e.target.value))}
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.is_active ? "🟢" : "🔴"} {s.name.replace(" Season", "")}
            </option>
          ))}
        </select>

        {/* 정규 / POST 토글 */}
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

        {/* 구분선 */}
        <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

        {/* ── 월 캐러셀 외부 wrapper: overflow:hidden으로 레이아웃 이탈 차단 ── */}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", position: "relative" }}>
        <div
          ref={monthScrollRef}
          onScroll={onMonthScroll}
          onMouseDown={handleMonthMouseDown}
          onMouseMove={handleMonthMouseMove}
          onMouseUp={handleMonthMouseUp}
          onMouseLeave={handleMonthMouseUp}
          style={{
            display: "flex",
            alignItems: "center",
            gap: GAP,
            overflowX: "auto",
            scrollbarWidth: "none",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            cursor: "grab",
            userSelect: "none",
          }}
        >
          {/* 앞 스페이서: 첫 아이템도 중앙에 올 수 있게 */}
          <div style={{ flexShrink: 0, scrollSnapAlign: "none", width: "calc(50% - 26px)", minWidth: "calc(50% - 26px)" }} />

          {months.map((m, idx) => {
            const dist = Math.abs(idx - centeredMonthIndex);
            const isCenter = dist === 0;
            const isAdjacent = dist === 1;
            const isActive = filterMonth === m;

            const scale = isCenter ? 1 : isAdjacent ? 0.85 : 0.7;
            const opacity = isCenter ? 1 : isAdjacent ? 0.7 : 0.45;
            const fontSize = isCenter ? 13 : 12;
            const paddingH = isCenter ? 14 : 10;

            return (
              <button
                key={m}
                data-month-item
                onClick={() => handleMonthClick(m, idx)}
                style={{
                  flexShrink: 0,
                  scrollSnapAlign: "center",
                  padding: `5px ${paddingH}px`,
                  borderRadius: 20,
                  background: isActive ? "var(--accent)" : "var(--surface2)",
                  color: isActive ? "#fff" : "var(--text-muted)",
                  border: isActive ? "none" : "1px solid var(--border)",
                  fontWeight: 600,
                  fontSize,
                  cursor: "pointer",
                  transform: `scale(${scale})`,
                  opacity,
                  transition: "transform 0.2s ease, opacity 0.2s ease, font-size 0.2s ease, background 0.15s",
                  transformOrigin: "center",
                  whiteSpace: "nowrap",
                }}
              >
                {labels[m]}
              </button>
            );
          })}

          {/* 뒤 스페이서: 마지막 아이템도 중앙에 올 수 있게 */}
          <div style={{ flexShrink: 0, scrollSnapAlign: "none", width: "calc(50% - 26px)", minWidth: "calc(50% - 26px)" }} />
        </div>
        </div>{/* overflow:hidden wrapper 닫기 */}

        {/* 달력 버튼 */}
        <button
          ref={calendarBtnRef}
          onClick={() => setCalendarOpen(!calendarOpen)}
          style={{
            marginLeft: 4, flexShrink: 0, width: 32, height: 32,
            borderRadius: 8, border: "1px solid var(--border)",
            background: calendarOpen ? "var(--accent)" : "var(--surface2)",
            color: calendarOpen ? "#fff" : "var(--text-muted)",
            cursor: "pointer", fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          📅
        </button>
      </div>

      {/* 달력 팝업 오버레이 */}
      {calendarOpen && (
        <>
          {/* 배경 클릭 시 닫기 */}
          <div
            onClick={() => setCalendarOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 99 }}
          />
          <div style={{
            position: "fixed",
            top: (() => {
              const btn = calendarBtnRef.current;
              if (!btn) return 60;
              const rect = btn.getBoundingClientRect();
              return rect.bottom + 6;
            })(),
            right: 12,
            zIndex: 100,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", padding: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            width: 280,
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
        </>
      )}

      {/* ── 일 캐러셀 (월 눌렀을 때만 표시) ── */}
      {monthClicked && filterMonth && daysWithGames.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
          {/* 전체 버튼 - 고정 */}
          <button
            onClick={() => setFilterDay(null)}
            style={{
              flexShrink: 0,
              width: 36, height: 36,
              borderRadius: "50%",
              background: filterDay === null ? "var(--accent2)" : "transparent",
              color: filterDay === null ? "#fff" : "var(--text-muted)",
              border: filterDay === null ? "2px solid var(--accent2)" : "2px solid var(--border)",
              fontWeight: 700, fontSize: 11, cursor: "pointer",
              transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1,
            }}>
            전체
          </button>

          {/* 일 캐러셀 */}
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <div
              ref={dayScrollRef}
              onMouseDown={handleDayMouseDown}
              onMouseMove={handleDayMouseMove}
              onMouseUp={handleDayMouseUp}
              onMouseLeave={handleDayMouseUp}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                overflowX: "auto",
                scrollbarWidth: "none",
                WebkitOverflowScrolling: "touch",
                cursor: "grab",
                userSelect: "none",
              }}
            >
              {daysWithGames.map((day) => {
                const isSelected = filterDay === String(day);
                return (
                  <button
                    key={day}
                    onClick={() => setFilterDay(String(day))}
                    style={{
                      flexShrink: 0,
                      width: 36, height: 36,
                      borderRadius: "50%",
                      background: isSelected ? "var(--accent2)" : "transparent",
                      color: isSelected ? "#fff" : "var(--text)",
                      border: isSelected ? "2px solid var(--accent2)" : "2px solid var(--border)",
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                      transition: "all 0.15s",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      lineHeight: 1,
                    }}>
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
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
        <PaginatedGames
          gameResults={gameResults}
          pageIndex={pageIndex}
          setPageIndex={setPageIndex}
          totalPagesRef={totalPagesRef}
          GAMES_PER_PAGE={GAMES_PER_PAGE}
          expandedGame={expandedGame}
          setExpandedGame={setExpandedGame}
          userId={userId}
        />
      )}
    </div>
  );
}

// ── 페이지네이션 게임 목록 컴포넌트 ──────────────────────────
function PaginatedGames({ gameResults, pageIndex, setPageIndex, totalPagesRef, GAMES_PER_PAGE, expandedGame, setExpandedGame, userId }: {
  gameResults: GameResult[];
  pageIndex: number;
  setPageIndex: (i: number) => void;
  totalPagesRef: React.MutableRefObject<number>;
  GAMES_PER_PAGE: number;
  expandedGame: number | null;
  setExpandedGame: (id: number | null) => void;
  userId: string;
}) {
  const totalPages = Math.min(Math.ceil(gameResults.length / GAMES_PER_PAGE), 3);
  totalPagesRef.current = totalPages;
  const pagedGames = gameResults.slice(pageIndex * GAMES_PER_PAGE, (pageIndex + 1) * GAMES_PER_PAGE);

  return (
    <>
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 5, padding: "4px 0 2px" }}>
          {Array.from({ length: totalPages }).map((_, i) => (
            <button key={i} onClick={() => setPageIndex(i)} style={{
              width: i === pageIndex ? 7 : 5, height: i === pageIndex ? 7 : 5,
              borderRadius: "50%",
              background: i === pageIndex ? "var(--text)" : "rgba(150,150,150,0.5)",
              border: "none", padding: 0, cursor: "pointer", transition: "all 0.2s", flexShrink: 0,
            }} />
          ))}
        </div>
      )}
      {pagedGames.map((game) => {
        const homeAbbr = game.home_team.split(" ").slice(-1)[0];
        const awayAbbr = game.away_team.split(" ").slice(-1)[0];
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
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
              {/* 좌: 라운드 + 포인트 배지 (투표탭과 동일) */}
              <div style={{ width: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 9, color: "var(--accent)", fontWeight: 700, textAlign: "center", lineHeight: 1.3, whiteSpace: "pre-wrap", wordBreak: "keep-all", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.4)", borderRadius: 4, padding: "1px 4px" }}>
                    {game.round.replace(" ", "\n")}
                  </span>
                  {(ROUND_POINTS as Record<string, number>)[game.round] && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 4, padding: "1px 4px", whiteSpace: "nowrap" }}>
                      {(ROUND_POINTS as Record<string, number>)[game.round]}pt
                    </span>
                  )}
                </div>
              </div>
              {/* 중: 홈로고 점수 : 점수 원정로고, 날짜시간은 점수 바로 위 */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <img src={getTeamLogoUrl(game.home_team)} alt={homeAbbr}
                  style={{ width: 56, height: 56, objectFit: "contain", filter: "drop-shadow(0 1px 6px rgba(0,0,0,0.5))", opacity: game.winner !== "home" ? 0.35 : 1, flexShrink: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <span style={{ fontSize: 11 }}>
                    <span style={{ color: "#ffffff" }}>{format(new Date(game.start_time), "M/d")}</span>
                    <span style={{ color: "var(--text-muted)" }}> {format(new Date(game.start_time), "HH:mm")}</span>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, whiteSpace: "nowrap", color: game.winner === "home" ? "#3b82f6" : "var(--text-muted)" }}>
                      {game.home_score ?? "-"}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>:</span>
                    <span style={{ fontSize: 20, fontWeight: 800, whiteSpace: "nowrap", color: game.winner === "away" ? "#3b82f6" : "var(--text-muted)" }}>
                      {game.away_score ?? "-"}
                    </span>
                  </div>
                </div>
                <img src={getTeamLogoUrl(game.away_team)} alt={awayAbbr}
                  style={{ width: 56, height: 56, objectFit: "contain", filter: "drop-shadow(0 1px 6px rgba(0,0,0,0.5))", opacity: game.winner !== "away" ? 0.35 : 1, flexShrink: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
              </div>
              {/* 우: 완료뱃지 (원래 그대로) */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                <span className="badge badge-correct">완료</span>
              </div>
            </div>

            {/* 적중자 */}
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
              {expandedGame === game.id && game.correctCount > 0 && (
                <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(34,197,94,0.08)", borderRadius: 6, fontSize: 13, lineHeight: 1.8 }}>
                  {game.correctVoters.map((voter, i) => (
                    <span key={i}>{voter.name}{i < game.correctVoters.length - 1 ? "\u00A0 " : ""}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}