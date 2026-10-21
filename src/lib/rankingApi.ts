import { v1Request } from './accessApi'
import type { QueryFilter } from './biTypes'

export type RankingCriterion = { key: 'avg_flights' | 'efficiency' | 'loss_rate'; title: string; weight: number; higher_is_better: boolean }
export type RankingRow = {
  category: string
  /** 'all' for the overall score, otherwise a mission group id. */
  mission: string
  battalion_id: string; company_id: string; crew: string
  /** Score 0–100: in a group the weighted mean of the crew's percentiles; overall the flight-weighted mean of its group scores. */
  score: number
  parts?: Partial<Record<RankingCriterion['key'], number>>
  missions?: Record<string, { score: number; flights: number }>
  flights: number; active_days: number; avg_flights: number; efficiency: number; lost: number
  company_place: number; company_total: number; battalion_place: number; battalion_total: number; brigade_place: number; brigade_total: number
}
export type Ranking = {
  missions: Array<{ id: string; title: string }>; criteria: RankingCriterion[]; ignore_losses: Record<string, string[]>
  min_flights: number; full_list: boolean; rows: RankingRow[]
}
export type RankingRequest = { date_range: { from: string; to: string }; time_from?: string; time_to?: string; filters: QueryFilter[] }

export const rankingApi = {
  get: (body: RankingRequest, signal?: AbortSignal) => v1Request<Ranking>('/analytics/ranking', 'POST', body, undefined, signal),
}
