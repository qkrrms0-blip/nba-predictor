// src/lib/types.ts

export type Round = "Play-In" | "First Round" | "Semifinals" | "Conf. Finals" | "Finals";

export const ROUND_POINTS: Record<Round, number> = {
  "Play-In": 1,
  "First Round": 1.5,
  Semifinals: 2,
  "Conf. Finals": 2.5,
  Finals: 3,
};

export interface User {
  id: string;
  email: string;
  name: string;
  approved: boolean;
  role: "user" | "admin";
  created_at: string;
}

export interface Season {
  id: number;
  name: string;
  is_active: boolean;
  started_at: string;
}

export interface Game {
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
}

export interface Vote {
  id: number;
  user_id: string;
  game_id: number;
  voted_team: "home" | "away";
  season_id: number;
  is_correct: boolean | null;
  points: number | null;
  created_at: string;
}

export interface RankingEntry {
  id: string;
  name: string;
  email: string;
  season_id: number;
  season_name: string;
  total_votes: number;
  correct_votes: number;
  total_points: number;
  accuracy_pct: number;
}

export interface VoteWithDetails extends Vote {
  users: Pick<User, "name" | "email">;
  games: Game;
}
