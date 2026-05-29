// src/lib/nba-api.ts

const BASE_URL = "https://api.balldontlie.io/v1";
const API_KEY = process.env.BALLDONTLIE_API_KEY!;

const headers = {
  Authorization: API_KEY,
  "Content-Type": "application/json",
};

export interface BDLGame {
  id: number;
  date: string;
  datetime: string | null;
  home_team: { id: number; full_name: string; abbreviation: string };
  visitor_team: { id: number; full_name: string; abbreviation: string };
  home_team_score: number;
  visitor_team_score: number;
  status: string;
  period: number;
  time: string;
  postseason: boolean;
  season: number;
}

export async function fetchGamesByDateRange(startDate: string, endDate: string): Promise<BDLGame[]> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    per_page: "100",
    postseason: "true",
  });
  const res = await fetch(`${BASE_URL}/games?${params}`, { headers });
  if (!res.ok) throw new Error(`BDL API error: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchGameById(gameId: number): Promise<BDLGame | null> {
  const res = await fetch(`${BASE_URL}/games/${gameId}`, { headers });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || null;
}

export function mapBDLGameToDBGame(game: BDLGame, seasonId: number) {
  return {
    season_id: seasonId,
    home_team: game.home_team.full_name,
    away_team: game.visitor_team.full_name,
    home_score: game.home_team_score || null,
    away_score: game.visitor_team_score || null,
    start_time: game.datetime || `${game.date}T00:00:00Z`,
    round: "First Round",
    winner: determineWinner(game),
    external_id: `bdl_${game.id}`,
  };
}

function determineWinner(game: BDLGame): "home" | "away" | null {
  if (game.status !== "Final") return null;
  if (game.home_team_score > game.visitor_team_score) return "home";
  if (game.visitor_team_score > game.home_team_score) return "away";
  return null;
}

// NBA 팀 약어 맵 (영문명 → ESPN 약어)
const TEAM_ABBR_MAP: Record<string, string> = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "LA Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
};

// ESPN CDN 로고 URL
export function getTeamLogoUrl(teamName: string): string {
  const abbr = TEAM_ABBR_MAP[teamName] || "NBA";
  return `https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png`;
}