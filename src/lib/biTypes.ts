export type DashboardType = 'DASHBOARD' | 'STATISTICS' | 'COMPARISON'
export type DashboardLayoutMode = 'LOCKED' | 'LAYOUT_EDITABLE' | 'CUSTOMIZABLE' | 'FREE'
export type WidgetLayout = { x: number; y: number; w: number; h: number }
export type MetricFormat = { type?: string; decimals?: number; suffix?: string; prefix?: string }
export type QueryFilter = { field: string; operator: string; value?: unknown }
export type DateRange = { from: string; to: string }
export type QueryRequest = {
  source?: string
  metrics: Array<{ key: string }>
  dimensions: Array<{ field: string; granularity?: string }>
  filters?: QueryFilter[]
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>
  top_n?: number | null
  date_range?: DateRange | null
  data_scope?: 'GLOBAL' | 'USER_SCOPE' | 'FIXED_SCOPE'
  fixed_scope?: { scope_type: string; scope_ids: string[]; filters: QueryFilter[] } | null
}
export type MetricDefinition = {
  id?: string; key: string; title: string; description?: string; source: string
  aggregation: string; field?: string | null; filters?: QueryFilter[]; format?: MetricFormat
  formula?: unknown; enabled?: boolean; [key: string]: unknown
}
export type MetricResultMetadata = { key: string; title?: string; label?: string; format?: MetricFormat; direction?: string }
export type QueryResult = {
  status: 'success' | 'empty' | 'error'
  rows: Record<string, unknown>[]
  metrics: MetricResultMetadata[]
  dimensions: string[]
  message?: string | null
  payload?: unknown
  separate_rows?: Record<string, unknown>[]
  dimension_labels?: Record<string, string>
}
export type BatchQueryResult = { results: Array<{ index: number; status: 'success' | 'empty' | 'error'; data?: QueryResult; error?: { code: string; message: string } }> }
export type VisualizationSeries = { metric: string; type?: string; axis?: 'left' | 'right'; name?: string; color?: string }
export type VisualizationDefinition = {
  type: string
  series?: VisualizationSeries[]
  axes?: Record<string, unknown>
  legend?: Record<string, unknown>
  labels?: Record<string, unknown>
  tooltip?: Record<string, unknown>
  options?: Record<string, unknown>
}
export type WidgetDefinition = {
  id: string; dashboard_id?: string; title: string; widget_type: string; layout: WidgetLayout
  query: QueryRequest; visualization: VisualizationDefinition
  permissions?: { required_permissions?: string[]; roles?: string[]; users?: string[] }
  data_scope?: 'GLOBAL' | 'USER_SCOPE' | 'FIXED_SCOPE'; fixed_filters?: QueryFilter[]
  inherit_global_filters?: boolean; date_mode?: 'INHERIT_GLOBAL_DATE' | 'USE_FIXED_DATE'
  is_locked?: boolean; revision?: number
  owner_id?: string | null
  builtin?: 'summary' | 'timeline' | 'map' | 'records' | 'losses' | 'average' | 'category' | 'purpose' | null
  interaction?: WidgetInteraction
  visibility?: { conditions: QueryFilter[]; show_when_all_departments?: boolean }
  appearance?: { background?: string; color?: string; opacity?: number; radius?: number }
  widget_kind?: 'SYSTEM_WIDGET' | 'USER_WIDGET'
  mandatory?: boolean; movable?: boolean; resizable?: boolean; removable?: boolean
  section?: string | null
}
export type WidgetInteraction = { click_action: 'NONE' | 'CROSS_FILTER' | 'DRILL_THROUGH'; target_page?: 'STATISTICS' | 'DASHBOARD' | 'MAP' | 'TABLE'; target_section?: string | null; pass_date?: boolean; pass_filters?: boolean }
export type SemanticMetric = { key: string; label?: string; title?: string; category?: string; description?: string; format?: MetricFormat; kind?: string; direction?: string }
export type SemanticField = { key: string; field?: string; label?: string; title?: string; description?: string; type?: string; values?: Array<string | number | boolean | { value?: string | number | boolean; id?: string | number; label?: string; title?: string }>; operators?: string[] }
export type SemanticVisualization = { key?: string; type?: string; label?: string; title?: string; min_metrics?: number; max_metrics?: number; min_dimensions?: number; max_dimensions?: number; description?: string }
export type AnalyticsCatalog = { metrics: SemanticMetric[]; dimensions: SemanticField[]; filters: SemanticField[]; visualizations?: Array<SemanticVisualization | string>; supported_visualizations?: Array<SemanticVisualization | string>; permissions?: string[]; operators?: string[]; sections?: Array<{ key: string; label: string }> }
export type PersonalAppearance = { background: string; background_asset_id?: string | null; background_url?: string | null; background_opacity?: number; widget_opacity?: number; grid_spacing?: number; density?: 'compact' | 'comfortable'; card_radius?: number; shadow?: boolean; accent?: string }
export type PersonalDashboard = { dashboard: DashboardDefinition; appearance: PersonalAppearance; revision: number; migrated: boolean; hidden_widget_ids?: string[]; available_widgets?: WidgetDefinition[] }
export type DashboardAssignment = { assignment_type?: string; target_type?: string; target_id?: string; [key: string]: unknown }
export type DashboardDefinition = {
  id: string; name: string; slug: string; description?: string; type: DashboardType
  is_system: boolean; layout_mode: DashboardLayoutMode; version: 2; revision: number
  widgets: WidgetDefinition[]; assignments?: DashboardAssignment[]; global_filters?: QueryFilter[]
  created_by?: string | null; created_at?: string | null; updated_at?: string | null
  user_override_revision?: number
}
export type MetadataField = { field?: string; key?: string; title?: string; label?: string; type?: string; values?: unknown[] }
export type AnalyticsMetadata = {
  dimensions: Array<MetadataField | string>; filter_fields: Array<MetadataField | string>
  metrics: MetricDefinition[]; visualizations: Array<{ type?: string; key?: string; title?: string } | string>
  aggregations: string[]; operators?: string[]; sources?: Array<Record<string, unknown> | string>
  permissions?: string[]; data_scope?: unknown; [key: string]: unknown
}
export type WidgetQueryResult = { widget_id: string; status: 'success' | 'empty' | 'error'; data?: QueryResult; error?: string }
export type DashboardQueryResult = { dashboard_id?: string; revision?: number; results: WidgetQueryResult[] }
export type DashboardOverrides = { revision: number; overrides: Array<{ widget_id: string; layout: WidgetLayout }> }
export type ComparisonMetricResult = {
  metric: string; title?: string; own?: number | null; peer?: number | null
  difference_percent?: number | null; difference_pp?: number | null
  direction?: string; range?: string | number[] | null; message?: string | null
  [key: string]: unknown
}
export type AnalyticsComparison = {
  precision: string; level: string; rows: Record<string, unknown>[]; raw_visible: boolean
}
export type AnalyticsComparisonRequest = {
  level: 'DEPARTMENT' | 'GROUP' | 'TEAM' | 'CATEGORY' | 'BBAK' | 'CREW'; own_id: string; peer_id?: string | null
  context_category?: string | null
  context_department_id?: string | null; context_group_id?: string | null; query: QueryRequest
}
export type HierarchyOption = { id: string; title: string; department_id?: string; group_id?: string; category?: string }
export type AnalyticsHierarchy = { departments: HierarchyOption[]; groups: HierarchyOption[]; teams: HierarchyOption[]; categories?: HierarchyOption[]; crews?: HierarchyOption[] }
