// src/app/ranking/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Season, RankingEntry } from "@/lib/types";

export default function RankingPage() {
  const supabase = createClient();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
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

  useEffect(() => {
    if (selectedSeason === null) return;
    loadRanking(selectedSeason);
  }, [selectedSeason]);

  const loadRanking = async (seasonId: number) => {
    setLoading(true);

    const { data: allUsers } = await supabase
      .from("users")
      .select("id, name, email, bonus_points")
      .eq("approved", true);

    const { data: votes } = await supabase
      .from("votes")
      .select("user_id, is_correct, points")
      .eq("season_id", seasonId)
      .not("is_correct", "is", null);

    if (!allUsers) {
      setRankings([]);
      setLoading(false);
      return;
    }

    const rankMap: Record<string, RankingEntry> = {};
    allUsers.forEach((u: { id: string; name: string; email: string; bonus_points: number | null }) => {
      rankMap[u.id] = {
        id: u.id,
        name: u.name,
        email: u.email,
        season_id: seasonId,
        season_name: "",
        total_votes: 0,
        correct_votes: 0,
        total_points: u.bonus_points || 0,
        accuracy_pct: 0,
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

    const result = Object.values(rankMap).map((entry) => ({
      ...entry,
      total_points: Math.round(entry.total_points * 10) / 10,
      accuracy_pct: entry.total_votes > 0
        ? Math.round((entry.correct_votes / entry.total_votes) * 1000) / 10
        : 0,
    })).sort((a, b) => b.total_points - a.total_points || b.accuracy_pct - a.accuracy_pct);

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
                    padding: "8px 6px",
                    minWidth: 0,
                  }}
                >
                  <div className={`rank-num ${getRankClass(rank)}`} style={{ minWidth: 28, fontSize: 15 }}>
                    {getRankDisplay(rank)}
                  </div>
                  <div className="rank-info" style={{ minWidth: 0, flex: 1 }}>
                    <div className="rank-name" style={{ fontSize: 13 }}>
                      {entry.name}
                      {entry.id === myId && (
                        <span style={{ fontSize: 10, color: "var(--accent2)", marginLeft: 4 }}>나</span>
                      )}
                    </div>
                    <div className="rank-sub" style={{ fontSize: 10 }}>
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
                      padding: "8px 6px",
                      minWidth: 0,
                    }}
                  >
                    <div className={`rank-num ${getRankClass(rightRank!)}`} style={{ minWidth: 28, fontSize: 15 }}>
                      {getRankDisplay(rightRank!)}
                    </div>
                    <div className="rank-info" style={{ minWidth: 0, flex: 1 }}>
                      <div className="rank-name" style={{ fontSize: 13 }}>
                        {rightEntry.name}
                        {rightEntry.id === myId && (
                          <span style={{ fontSize: 10, color: "var(--accent2)", marginLeft: 4 }}>나</span>
                        )}
                      </div>
                      <div className="rank-sub" style={{ fontSize: 10 }}>
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