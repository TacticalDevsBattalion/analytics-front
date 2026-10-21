import { v1Request } from './accessApi'
import type { QueryFilter } from './biTypes'

export type RankingRow = {
  category: string; battalion_id: string; company_id: string; crew: string; value: number; flights: number | null
  company_place: number; company_total: number; battalion_place: number; battalion_total: number; brigade_place: number; brigade_total: number
}
export type Ranking = { metric: string; title: string; format: { type?: string; decimals?: number }; higher_is_better: boolean; min_flights: number; full_list: boolean; rows: RankingRow[] }
export type RankingRequest = { date_range: { from: string; to: string }; time_from?: string; time_to?: string; filters: QueryFilter[]; metric: string }

export const rankingApi = {
  get: (body: RankingRequest, signal?: AbortSignal) => v1Request<Ranking>('/analytics/ranking', 'POST', body, undefined, signal),
}

// Metrics offered for ranking, most useful first; only those the user can see are shown.
export const RANKING_METRICS = ['efficiency', 'flights', 'effective', 'target_results', 'target_destroyed', 'detected', 'flights_per_result']
