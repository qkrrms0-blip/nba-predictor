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

      if (seasonData) {
        setSeasons(seasonData);
        const active = seasonData.find((s: Season) => s.is_active);
        if (active) setSelectedSeason(active.id);
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

    // 승인된 모든 유저 가져오기
    const { data: allUsers } = await supabase
      .from("users")
      .select("id, name, email, bonus_points")
      .eq("approved", true);

    // 해당 시즌 투표 집계
    const { data: votes } = await supabase
      .from("votes")
      .select("user_id, is_correct, points")
      .eq("season_id", seasonId);

    if (!allUsers) {
      setRankings([]);
      setLoading(false);
      return;
    }

    // 유저별 집계
    const rankMap: Record<string, RankingEntry> = {};
    allUsers.forEach((u: { id: string; name: string; email: string }) => {
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

    // 정확도 계산 + 정렬
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

  // 동점자 고려한 순위 계산
  const getRank = (idx: number): number => {
    if (idx === 0) return 1;
    const prev = rankings[idx - 1];
    const curr = rankings[idx];
    if (prev.total_points === curr.total_points) {
      return getRank(idx - 1);
    }
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

  return (
    <>
      

      <div className="filter-row">
        <select
          className="filter-select"
          value={selectedSeason ?? ""}
          onChange={(e) => setSelectedSeason(Number(e.target.value))}
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.is_active ? "🔴" : ""}
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
        rankings.map((entry, idx) => {
          const rank = getRank(idx);
          return (
            <div
              key={entry.id}
              className="rank-card"
              style={entry.id === myId ? { borderColor: "var(--accent2)" } : {}}
            >
              <div className={`rank-num ${getRankClass(rank)}`}>
                {getRankDisplay(rank)}
              </div>
              <div className="rank-info">
                <div className="rank-name">
                  {entry.name}
                  {entry.id === myId && (
                    <span style={{ fontSize: 11, color: "var(--accent2)", marginLeft: 6 }}>나</span>
                  )}
                </div>
                <div className="rank-sub">
                  {entry.correct_votes}/{entry.total_votes} 적중 · 정확도 {entry.accuracy_pct}%
                </div>
              </div>
              <div className="rank-points">{entry.total_points}pt</div>
            </div>
          );
        })
      )}
    </>
  );
}