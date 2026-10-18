// src/app/ranking/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Season, RankingEntry } from "@/lib/types";
import { SeasonType, detectSeasonType, fetchSeasonRanking } from "@/lib/ranking";

export default function RankingPage() {
  const supabase = createClient();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [seasonType, setSeasonType] = useState<SeasonType | null>(null);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState("");

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setMyId(user.id);

      const { data: seasonData } = await supabase
        .from("seasons")
        .select("*")
        .order("id", { ascending: false });

      if (seasonData && seasonData.length > 0) {
        setSeasons(seasonData);
        const active = seasonData.find((s: Season) => s.is_active);
        // 활성 시즌이 없으면(시즌 종료 상태) 가장 최근 시즌을 기본 선택
        setSelectedSeason(active ? active.id : seasonData[0].id);
      }
    };
    init();
  }, []);

  // 시즌을 바꾸면 그 시즌의 지금 단계(정규/포스트)를 기본으로 보여준다
  useEffect(() => {
    if (selectedSeason === null) return;
    setSeasonType(null);
    detectSeasonType(supabase, selectedSeason).then(setSeasonType);
  }, [selectedSeason]);

  useEffect(() => {
    if (selectedSeason === null || seasonType === null) return;
    loadRanking(selectedSeason, seasonType);
  }, [selectedSeason, seasonType]);

  const loadRanking = async (seasonId: number, type: SeasonType) => {
    setLoading(true);
    const result = await fetchSeasonRanking(supabase, seasonId, type);
    setRankings(result);
    setLoading(false);
  };

  const getRank = (idx: number): number => {
    if (idx === 0) return 1;
    const prev = rankings[idx - 1];
    const curr = rankings[idx];
    if (prev.total_points === curr.total_points) return getRank(idx - 1);
    return idx + 1;
  };

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return rank;
  };

  const getRankClass = (rank: number) => {
    if (rank === 1) return "top1";
    if (rank === 2) return "top2";
    if (rank === 3) return "top3";
    return "";
  };

  // 2열 배치: [1,9], [2,10], ... 순서로 재배열
  // 왼쪽 열: idx 0~7 (1~8위), 오른쪽 열: idx 8~15 (9~16위)
  const half = Math.ceil(rankings.length / 2);
  const leftCol = rankings.slice(0, half);
  const rightCol = rankings.slice(half);

  return (
    <>
      {/* 시즌 선택 드롭다운 */}
      <div className="filter-row" style={{ marginBottom: 10 }}>
        <select
          className="filter-select"
          value={selectedSeason ?? ""}
          onChange={(e) => setSelectedSeason(Number(e.target.value))}
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.is_active ? "🟢" : "🔴"} {s.name}
            </option>
          ))}
        </select>
        {(["regular", "post"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSeasonType(t)}
            style={{
              marginLeft: 6, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: "1px solid var(--border)",
              background: seasonType === t ? "var(--accent)" : "var(--surface2)",
              color: seasonType === t ? "#fff" : "var(--text-muted)",
            }}
          >
            {t === "regular" ? "정규" : "POST"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : rankings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏆</div>
          <div className="empty-title">아직 데이터가 없습니다</div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px",
            padding: "0 2px",
            maxWidth: 480,
            margin: "0 auto",
          }}
        >
          {leftCol.map((entry, colIdx) => {
            const idx = colIdx;
            const rank = getRank(idx);
            const rightEntry = rightCol[colIdx];
            const rightIdx = half + colIdx;
            const rightRank = rightEntry ? getRank(rightIdx) : null;

            return (
              <div
                key={`row-${colIdx}`}
                style={{ display: "contents" }}
              >
                {/* 왼쪽 카드 */}
                <div
                  className="rank-card"
                  style={{
                    ...(entry.id === myId ? { borderColor: "var(--accent2)" } : {}),
                    padding: "6px 4px",
                    minWidth: 0,
                  }}
                >
                  <div className={`rank-num ${getRankClass(rank)}`} style={{ minWidth: 20, fontSize: 14 }}>
                    {getRankDisplay(rank)}
                  </div>
                  <div className="rank-info" style={{ minWidth: 0, flex: 1 }}>
                    <div className="rank-name" style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {entry.name}
                      {entry.id === myId && (
                        <span style={{ fontSize: 10, color: "var(--accent2)", marginLeft: 4 }}>나</span>
                      )}
                    </div>
                    <div className="rank-sub" style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                      {entry.correct_votes}/{entry.total_votes} · {entry.accuracy_pct}%
                    </div>
                  </div>
                  <div className="rank-points" style={{ fontSize: 20, fontWeight: 700, whiteSpace: "nowrap", lineHeight: 1 }}>{entry.total_points}</div>
                </div>

                {/* 오른쪽 카드 (없으면 빈 칸) */}
                {rightEntry ? (
                  <div
                    className="rank-card"
                    style={{
                      ...(rightEntry.id === myId ? { borderColor: "var(--accent2)" } : {}),
                      padding: "6px 4px",
                      minWidth: 0,
                    }}
                  >
                    <div className={`rank-num ${getRankClass(rightRank!)}`} style={{ minWidth: 20, fontSize: 14 }}>
                      {getRankDisplay(rightRank!)}
                    </div>
                    <div className="rank-info" style={{ minWidth: 0, flex: 1 }}>
                      <div className="rank-name" style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {rightEntry.name}
                        {rightEntry.id === myId && (
                          <span style={{ fontSize: 10, color: "var(--accent2)", marginLeft: 4 }}>나</span>
                        )}
                      </div>
                      <div className="rank-sub" style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                        {rightEntry.correct_votes}/{rightEntry.total_votes} · {rightEntry.accuracy_pct}%
                      </div>
                    </div>
                    <div className="rank-points" style={{ fontSize: 20, fontWeight: 700, whiteSpace: "nowrap", lineHeight: 1 }}>{rightEntry.total_points}</div>
                  </div>
                ) : (
                  <div />
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}