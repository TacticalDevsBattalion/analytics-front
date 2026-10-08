import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { ComparisonFilterSettings, FilterOptions, FilterState, IdTitleOption } from '../lib/types'
import { useLanguage } from '../i18n/LanguageContext'
import { getFrontendConfig } from '../config'
import { temporalPeriodCount, temporalPresetRange } from '../lib/comparison'
import { comparisonSetupValidation } from '../lib/comparisonSetup'
import { dateTimeValue, parseDateTimeValue } from '../lib/periodInput'
import { useAppConfiguration } from '../config/AppConfigurationContext'
import { configurationLabel } from '../config/appConfiguration'
import { canonicalOrganizationFilters, countSelectedFilters, optionsWithSelections, resolveFilterFields, selectedFilterKeys } from '../lib/filterConfiguration'
import { useCustomFilters } from '../config/CustomFiltersContext'
import { countCustomValues, customSignature, describeCustomValue, isCustomValueActive, pruneCustomValues, type CustomFilterDefinition, type CustomFilterValue, type CustomFilterValues, type NumberRangeValue } from '../lib/customFilters'
import type { ConfiguredFilterKey, SelectionFilterKey } from '../lib/filterConfiguration'
import './FilterBarConfiguration.css'
import './FilterBarRefresh.css'
import './FilterBarCompact.css'

type FilterMode = 'general' | 'detailed'

type Props = {
  filters: FilterState
  options?: FilterOptions
  onChange: (next: FilterState) => void
  mode?: FilterMode
  comparison?: {
    settings: ComparisonFilterSettings
    onApply: (filters: FilterState, settings: ComparisonFilterSettings) => void
  }
  initiallyOpen?: boolean
  /** Show administrator-defined filters (only pages that query the BI engine support them). */
  customFilters?: boolean
}

type MultiSelectOption = string | IdTitleOption

type MultiSelectProps = {
  label: string
  value: string[]
  options: MultiSelectOption[]
  onChange: (value: string[]) => void
  displayLabel?: (value: string, fallback: string) => string
  /** Administrator-defined filter: marked in the UI so users can tell it from the built-in ones. */
  custom?: boolean
}

const optionValue = (option: MultiSelectOption) =>
  typeof option === 'string' ? option : String(option.id)

const optionLabel = (option: MultiSelectOption) =>
  typeof option === 'string' ? option : option.title

type PeriodMode = 'calendar' | 'reporting'

type MultiSelectPosition = {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
}

const quickLabel = (
  key: string,
  tr: (uk: string, en: string) => string,
) => {
  const labels: Record<string, [string, string]> = {
    today: ['Сьогодні', 'Today'],
    yesterday: ['Вчора', 'Yesterday'],
    '7days': ['7 днів', '7 days'],
    '14days': ['14 днів', '14 days'],
    '30days': ['30 днів', '30 days'],
  }

  return labels[key] ? tr(...labels[key]) : key
}

function isoLocal(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sameValues(a: string[], b: string[]) {
  if (a.length !== b.length) return false

  const set = new Set(a)
  return b.every((value) => set.has(value))
}

function sameFilters(a: FilterState, b: FilterState) {
  return (
    a.date_from === b.date_from &&
    a.date_to === b.date_to &&
    (a.time_from ?? '') === (b.time_from ?? '') &&
    (a.time_to ?? '') === (b.time_to ?? '') &&
    sameValues(a.direction, b.direction) &&
    sameValues(a.unit, b.unit) &&
    sameValues(a.category, b.category) &&
    sameValues(a.asset, b.asset) &&
    sameValues(a.group, b.group) &&
    sameValues(a.bbak ?? [], b.bbak ?? []) &&
    sameValues(a.rota ?? [], b.rota ?? []) &&
    sameValues(a.battalion ?? [], b.battalion ?? []) &&
    sameValues(a.purpose, b.purpose) &&
    sameValues(a.class_name, b.class_name) &&
    sameValues(a.result, b.result)
  )
}

function cloneFilters(filters: FilterState): FilterState {
  return {
    ...filters,
    time_from: filters.time_from || undefined,
    time_to: filters.time_to || undefined,
    direction: [...filters.direction],
    unit: [...filters.unit],
    category: [...filters.category],
    asset: [...filters.asset],
    group: [...filters.group],
    bbak: [...(filters.bbak ?? [])],
    rota: [...(filters.rota ?? [])],
    battalion: [...(filters.battalion ?? [])],
    purpose: [...filters.purpose],
    class_name: [...filters.class_name],
    result: [...filters.result],
  }
}

function cloneComparisonSettings(settings: ComparisonFilterSettings): ComparisonFilterSettings {
  return { ...settings, reference_period: { ...settings.reference_period } }
}

function ordinaryComparisonSettings(filters: FilterState): ComparisonFilterSettings {
  return {
    enabled: false,
    mode: 'periods',
    dimension: 'unit',
    granularity: 'week',
    reference: 'previous',
    reference_period: {
      date_from: filters.date_from,
      date_to: filters.date_to,
      time_from: filters.time_from,
      time_to: filters.time_to,
    },
  }
}

function periodIsValid(filters: FilterState) {
  const { full_day_start, full_day_end } = getFrontendConfig().ui.filters
  const fromTime = filters.time_from || full_day_start
  const toTime = filters.time_to || full_day_end

  const from = new Date(`${filters.date_from}T${fromTime}`)
  const to = new Date(`${filters.date_to}T${toTime}`)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return false
  }

  return from.getTime() <= to.getTime()
}

function MultiSelectFilter({
  label,
  value,
  options,
  onChange,
  displayLabel,
  custom = false,
}: MultiSelectProps) {
  const { tr, locale } = useLanguage()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [panelPosition, setPanelPosition] =
    useState<MultiSelectPosition | null>(null)
  const availableOptions = useMemo(() => optionsWithSelections(options, value), [options, value])
  const visibleLabel = (option: MultiSelectOption) => displayLabel?.(optionValue(option), optionLabel(option)) || optionLabel(option)

  useEffect(() => {
    if (!open) {
      setPanelPosition(null)
      return
    }

    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const edge = 12
      const gap = 6
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      const width = Math.min(
        Math.max(rect.width, 220),
        Math.min(320, viewportWidth - edge * 2),
      )

      let left = rect.left

      if (left + width > viewportWidth - edge) {
        left = viewportWidth - width - edge
      }

      left = Math.max(edge, left)

      const availableBelow = Math.max(
        0,
        viewportHeight - rect.bottom - gap - edge,
      )
      const availableAbove = Math.max(
        0,
        rect.top - gap - edge,
      )

      const openBelow =
        availableBelow >= 260 || availableBelow >= availableAbove

      const availableHeight = openBelow
        ? availableBelow
        : availableAbove

      const maxHeight = Math.max(
        180,
        Math.min(430, availableHeight),
      )

      setPanelPosition({
        top: openBelow ? rect.bottom + gap : undefined,
        bottom: openBelow
          ? undefined
          : viewportHeight - rect.top + gap,
        left,
        width,
        maxHeight,
      })
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node

      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false)
        setSearch('')
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        setSearch('')
        triggerRef.current?.focus()
      }
    }

    updatePosition()

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLocaleLowerCase(locale)

    if (!q) return availableOptions

    return availableOptions.filter((option) =>
      visibleLabel(option).toLocaleLowerCase(locale).includes(q),
    )
  }, [availableOptions, search, displayLabel, locale])

  const selectedSet = useMemo(() => new Set(value), [value])

  const allFilteredSelected =
    filteredOptions.length > 0 &&
    filteredOptions.every((option) => selectedSet.has(optionValue(option)))

  const toggleOption = (option: MultiSelectOption) => {
    const selectedValue = optionValue(option)
    if (selectedSet.has(selectedValue)) {
      onChange(value.filter((x) => x !== selectedValue))
      return
    }

    onChange([...value, selectedValue])
  }

  const toggleFiltered = () => {
    const next = new Set(value)

    if (allFilteredSelected) {
      filteredOptions.forEach((option) => next.delete(optionValue(option)))
    } else {
      filteredOptions.forEach((option) => next.add(optionValue(option)))
    }

    onChange([...next])
  }

  const triggerText = useMemo(() => {
    if (!value.length) return tr('Усі', 'All')
    const labelsByValue = new Map(availableOptions.map((option) => [optionValue(option), visibleLabel(option)]))
    const first = labelsByValue.get(value[0]) ?? value[0]
    if (value.length === 1) return first
    return `${first} +${value.length - 1}`
  }, [value, availableOptions, displayLabel, tr])

  const toggleOpen = () => {
    if (!availableOptions.length) return

    setOpen((current) => {
      if (current) setSearch('')
      return !current
    })
  }

  return (
    <div className={'filter-field multi-select' + (custom ? ' filter-field--custom' : '')} ref={rootRef}>
      <span title={custom ? tr('Фільтр, доданий адміністратором', 'Filter added by an administrator') : undefined}>{quickLabel(label, tr)}</span>

      <button
        ref={triggerRef}
        type="button"
        className={`multi-select__trigger ${open ? 'active' : ''} ${
          value.length ? 'has-value' : ''
        }`}
        onClick={toggleOpen}
        disabled={!availableOptions.length}
        aria-label={label}
        aria-expanded={open}
      >
        <span className="multi-select__summary">
          {availableOptions.length ? triggerText : tr('Немає даних', 'No data')}
        </span>

        {value.length > 0 && (
          <span className="multi-select__count">{value.length}</span>
        )}

        <ChevronDown size={15} className={open ? 'rotated' : ''} />
      </button>

      {open &&
        panelPosition &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={(node) => {
              panelRef.current = node

              if (node) {
                node.style.setProperty('position', 'fixed', 'important')
                node.style.setProperty('right', 'auto', 'important')
                node.style.setProperty('inset-inline-end', 'auto', 'important')
                node.style.setProperty('min-width', '0', 'important')
                node.style.setProperty('box-sizing', 'border-box', 'important')
              }
            }}
            className="multi-select__panel multi-select__panel--portal multi-select__panel--configured"
            style={{
              top: panelPosition.top,
              bottom: panelPosition.bottom,
              left: panelPosition.left,
              right: 'auto',
              width: panelPosition.width,
              minWidth: 0,
              maxWidth: 'calc(100vw - 24px)',
              boxSizing: 'border-box',
              maxHeight: panelPosition.maxHeight,
            }}
          >
          <div className="multi-select__search">
            <Search size={15} />

            <input
              autoFocus
              value={search}
              placeholder={`${tr('Пошук', 'Search')}: ${label.toLowerCase()}...`}
              onChange={(e) => setSearch(e.target.value)}
            />

            {search && (
              <button
                type="button"
                aria-label={tr('Очистити пошук', 'Clear search')}
                onClick={() => setSearch('')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="multi-select__tools">
            <button
              type="button"
              onClick={toggleFiltered}
              disabled={!filteredOptions.length}
            >
              {allFilteredSelected ? tr('Зняти показані', 'Deselect shown') : tr('Вибрати показані', 'Select shown')}
            </button>

            <button
              type="button"
              onClick={() => onChange([])}
              disabled={!value.length}
            >
              {tr('Очистити', 'Clear')}
            </button>

            <span>{value.length ? `${tr('Обрано', 'Selected')}: ${value.length}` : tr('Усі значення', 'All values')}</span>
          </div>

          <div className="multi-select__options">
            {filteredOptions.length === 0 ? (
              <div className="multi-select__empty">{tr('Нічого не знайдено', 'Nothing found')}</div>
            ) : (
              filteredOptions.map((option) => {
                const rawValue = optionValue(option)
                const label = visibleLabel(option)
                const checked = selectedSet.has(rawValue)

                return (
                  <label
                    className={`multi-select__option ${checked ? 'selected' : ''}`}
                    key={rawValue}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(option)}
                    />

                    <span className="multi-select__checkbox">
                      {checked && <Check size={13} strokeWidth={3} />}
                    </span>

                    <span className="multi-select__option-text">{label}</span>
                  </label>
                )
              })
            )}
          </div>
        </div>,
          document.body,
        )}
    </div>
  )
}

export function FilterBar({
  filters,
  options,
  onChange,
  comparison,
  initiallyOpen = true,
  customFilters: showCustom = false,
}: Props) {
  const { tr } = useLanguage()
  const { config } = useAppConfiguration()
  const customContext = useCustomFilters()
  const customDefs = showCustom ? customContext.definitions : []
  const [draftCustom, setDraftCustom] = useState<CustomFilterValues>(() => ({ ...customContext.values }))
  useEffect(() => { setDraftCustom({ ...customContext.values }) }, [customContext.values])
  const panelId = useId()
  const [step, setStep] = useState(0)
  const stepsLayout = config.filters.layout === 'steps'
  const initialOrganizationDimension = comparison?.settings.enabled && comparison.settings.mode !== 'periods'
    ? comparison.settings.dimension : config.filters.organization_dimension
  const submittedFilters = canonicalOrganizationFilters(filters, initialOrganizationDimension)
  const initialSettings = () => cloneComparisonSettings(comparison?.settings || {
    ...ordinaryComparisonSettings(filters),
    dimension: config.filters.organization_dimension,
    mode: config.defaults.comparison_mode,
    granularity: config.defaults.comparison_granularity,
  })
  const frontendConfig = getFrontendConfig()
  const filterConfig = frontendConfig.ui.filters
  const quick = filterConfig.quick_periods
  const reportingCutoffs = filterConfig.reporting_cutoffs
  const initialReportingCutoff =
    filters.time_from === filters.time_to &&
    reportingCutoffs.includes(filters.time_from || '')
      ? (filters.time_from as string)
      : filterConfig.default_reporting_cutoff

  const initialDayMode: PeriodMode =
    filters.time_from === filters.time_to &&
    reportingCutoffs.includes(filters.time_from || '')
      ? 'reporting'
      : 'calendar'

  const [panelOpen, setPanelOpen] = useState(initiallyOpen)
  const [dayMode, setDayMode] = useState<PeriodMode>(initialDayMode)
  const [reportingCutoff, setReportingCutoff] = useState<string>(initialReportingCutoff)
  const [draft, setDraft] = useState<FilterState>(() => cloneFilters(submittedFilters))
  const [draftSettings, setDraftSettings] = useState<ComparisonFilterSettings>(initialSettings)
  const comparisonSettingsKey = JSON.stringify(comparison?.settings || null)

  const restoreSubmitted = () => {
    setDraft(cloneFilters(submittedFilters))
    setDraftCustom({ ...customContext.values })
    setDraftSettings(initialSettings())
    setDayMode(initialDayMode)
    setReportingCutoff(initialReportingCutoff)
  }
  const closePanel = () => { restoreSubmitted(); setPanelOpen(false) }

  useEffect(() => {
    setDraftSettings(initialSettings())
  }, [comparisonSettingsKey])

  useEffect(() => { if (initiallyOpen) setPanelOpen(true) }, [initiallyOpen])

  useEffect(() => {
    setDraft(cloneFilters(submittedFilters))

    if (
      filters.time_from === filters.time_to &&
      reportingCutoffs.includes(filters.time_from || '')
    ) {
      setDayMode('reporting')
      setReportingCutoff(filters.time_from as string)
    } else {
      setDayMode('calendar')
    }
  }, [filters])

  useEffect(() => {
    if (!panelOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Escape dismisses the nearest layer first, retaining unapplied choices.
        if (event.defaultPrevented || document.querySelector('.multi-select__panel--portal')) return
        closePanel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [panelOpen, filters, comparisonSettingsKey])

  const customDirty = showCustom && customSignature(customDefs, draftCustom) !== customSignature(customDefs, customContext.values)
  const dirty = customDirty || !sameFilters(draft, submittedFilters) || Boolean(comparison && (
    JSON.stringify(draftSettings) !== comparisonSettingsKey ||
    (draftSettings.enabled && draftSettings.mode !== 'periods' && JSON.stringify(draft[draftSettings.dimension]) !== JSON.stringify(submittedFilters[draftSettings.dimension]))
  ))
  const validPeriod = useMemo(() => periodIsValid(draft), [draft])
  const validation = comparison ? comparisonSetupValidation(draftSettings, draft) : validPeriod ? null : 'period'
  const canApply = (dirty || initiallyOpen) && validation == null

  const reportingBoundaryToday = (
    cutoff: string,
    now = new Date(),
  ) => {
    const [hour, minute] = cutoff.split(':').map(Number)
    const boundary = new Date(now)
    boundary.setHours(hour, minute, 0, 0)
    return boundary
  }

  const buildQuickPeriod = (
    days: number,
    offset: number,
    mode: 'calendar' | 'reporting' =
      dayMode === 'reporting' ? 'reporting' : 'calendar',
    cutoff = reportingCutoff,
  ): Pick<FilterState, 'date_from' | 'date_to' | 'time_from' | 'time_to'> => {
    if (mode === 'calendar') {
      const end = new Date()
      end.setHours(frontendConfig.app.defaults.calendar_anchor_hour, 0, 0, 0)
      end.setDate(end.getDate() - offset)

      const start = new Date(end)
      start.setDate(start.getDate() - Math.max(days - 1, 0))

      return {
        date_from: isoLocal(start),
        date_to: isoLocal(end),
        time_from: undefined,
        time_to: undefined,
      }
    }

    const end = reportingBoundaryToday(cutoff)
    end.setDate(end.getDate() - offset)

    const start = new Date(end)
    start.setDate(start.getDate() - days)

    return {
      date_from: isoLocal(start),
      date_to: isoLocal(end),
      time_from: cutoff,
      time_to: cutoff,
    }
  }

  const buildMonthPeriod = (
    mode: 'calendar' | 'reporting' =
      dayMode === 'reporting' ? 'reporting' : 'calendar',
    cutoff = reportingCutoff,
  ): Pick<FilterState, 'date_from' | 'date_to' | 'time_from' | 'time_to'> => {
    if (mode === 'calendar') {
      const end = new Date()
      end.setHours(frontendConfig.app.defaults.calendar_anchor_hour, 0, 0, 0)
      const start = new Date(end.getFullYear(), end.getMonth(), 1, frontendConfig.app.defaults.calendar_anchor_hour)

      return {
        date_from: isoLocal(start),
        date_to: isoLocal(end),
        time_from: undefined,
        time_to: undefined,
      }
    }

    const end = reportingBoundaryToday(cutoff)
    const [hour, minute] = cutoff.split(':').map(Number)

    // Reporting month starts at the cutoff on the last calendar day
    // of the previous month. Example:
    // September @ 15:00 => Aug 31 15:00 → today 15:00.
    const start = new Date(end.getFullYear(), end.getMonth(), 0)
    start.setHours(hour, minute, 0, 0)

    return {
      date_from: isoLocal(start),
      date_to: isoLocal(end),
      time_from: cutoff,
      time_to: cutoff,
    }
  }

  const samePeriod = (
    period: Pick<FilterState, 'date_from' | 'date_to' | 'time_from' | 'time_to'>,
  ) =>
    draft.date_from === period.date_from &&
    draft.date_to === period.date_to &&
    (draft.time_from ?? '') === (period.time_from ?? '') &&
    (draft.time_to ?? '') === (period.time_to ?? '')

  const activeQuick = useMemo(() => {
    for (const item of quick) {
      if (samePeriod(buildQuickPeriod(item.days, item.offset))) {
        return item.key
      }
    }

    if (samePeriod(buildMonthPeriod())) {
      return 'thisMonth'
    }

    return null
  }, [
    draft.date_from,
    draft.date_to,
    draft.time_from,
    draft.time_to,
    dayMode,
    reportingCutoff,
  ])

  const setDraftField = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const setQuick = (days: number, offset: number) => {
    const period = buildQuickPeriod(days, offset)

    setDraft((current) => ({
      ...current,
      ...period,
    }))
  }

  const thisMonth = () => {
    const period = buildMonthPeriod()

    setDraft((current) => ({
      ...current,
      ...period,
    }))
  }

  const changeDayMode = (mode: PeriodMode) => {
    if (mode === dayMode) return

    setDayMode(mode)

    setDraft((current) => {
      if (mode === 'calendar') {
        return {
          ...current,
          time_from: undefined,
          time_to: undefined,
        }
      }

      let dateFrom = current.date_from
      const dateTo = current.date_to

      if (dateFrom === dateTo) {
        const start = new Date(`${dateTo}T${String(frontendConfig.app.defaults.calendar_anchor_hour).padStart(2, '0')}:00:00`)
        start.setDate(start.getDate() - 1)
        dateFrom = isoLocal(start)
      }

      return {
        ...current,
        date_from: dateFrom,
        time_from: reportingCutoff,
        time_to: reportingCutoff,
      }
    })
  }

  const changeReportingCutoff = (cutoff: string) => {
    setReportingCutoff(cutoff)

    if (dayMode === 'reporting') {
      setDraft((current) => ({
        ...current,
        time_from: cutoff,
        time_to: cutoff,
      }))
    }
  }

  const changeCustomDate = (key: 'date_from' | 'date_to', value: string) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }))
  }

  /** One field carries both the date and the time of day. */
  const changeDateTime = (side: 'from' | 'to', value: string) => {
    const parsed = parseDateTimeValue(side, value)
    if (!parsed) return // incomplete or cleared input: keep the previous valid period
    if (side === 'from') setDraft((current) => ({ ...current, date_from: parsed.date, time_from: parsed.time }))
    else setDraft((current) => ({ ...current, date_to: parsed.date, time_to: parsed.time }))
  }

  /** Applies a quick period straight from the closed filter bar, keeping every other applied filter. */
  const applyQuickPeriod = (period: Pick<FilterState, 'date_from' | 'date_to' | 'time_from' | 'time_to'>) => {
    onChange(cloneFilters({ ...submittedFilters, ...period }))
  }

  const resetSelections = () => {
    setDraft((current) => ({
      ...current,
      direction: [],
      unit: [],
      category: [],
      class_name: [],
      asset: [],
      group: [],
      bbak: [],
      rota: [],
      battalion: [],
      purpose: [],
      result: [],
    }))
    setDraftCustom({})
    setDraftSettings((current) => ({ ...current, enabled: false }))
  }

  const applyFilters = () => {
    if (!canApply) return
    if (comparison) comparison.onApply(cloneFilters(draft), cloneComparisonSettings(draftSettings))
    else onChange(cloneFilters(draft))
    if (showCustom) customContext.setValues(pruneCustomValues(customDefs, draftCustom))
    setPanelOpen(false)
  }

  const activeFilterValues = countSelectedFilters(draft)
  const customApplied = showCustom ? countCustomValues(customDefs, customContext.values) : 0
  const customDraftCount = showCustom ? countCustomValues(customDefs, draftCustom) : 0
  const appliedFilterValues = countSelectedFilters(submittedFilters) + customApplied

  const appliedPeriodSummary = useMemo(() => {
    const from = filters.time_from
      ? `${filters.date_from} ${filters.time_from}`
      : filters.date_from
    const to = filters.time_to
      ? `${filters.date_to} ${filters.time_to}`
      : filters.date_to

    const reporting =
      filters.time_from === filters.time_to &&
      reportingCutoffs.includes(filters.time_from || '')

    return `${reporting ? tr('Звітна', 'Reporting') : tr('Період', 'Period')} · ${from} → ${to}`
  }, [filters])

  const dimensionLabels: Record<ComparisonFilterSettings['dimension'], string> = {
    unit: tr('Зона відповідальності', 'Responsibility zone'),
    bbak: tr('ББАК', 'BBAK'),
    rota: tr('Рота екіпажу', 'Crew company'),
    battalion: tr('Батальйон екіпажу', 'Crew battalion'),
  }
  const comparisonUnits = Boolean(comparison && draftSettings.enabled && draftSettings.mode !== 'periods')
  const dimension = draftSettings.dimension
  const organizationDimension = comparisonUnits ? dimension : config.filters.organization_dimension
  const resolvedFields = resolveFilterFields(config.filters.fields, organizationDimension)
  const mainFields = resolvedFields.filter((field) => field.placement === 'main' || (comparisonUnits && field.key === 'organization'))
  const extraFields = resolvedFields.filter((field) => field.placement === 'extra' && !(comparisonUnits && field.key === 'organization'))
  const extraSelected = extraFields.reduce((count, field) => count + draft[field.selectionKey].length, 0)
  const timeConfig = config.filters.fields.find((field) => field.key === 'time')
  const showTimeControl = timeConfig?.placement !== 'hidden' || Boolean(draft.time_from || draft.time_to)
  const configuredLabels = Object.fromEntries(resolvedFields.map((field) => [field.selectionKey, field.label]))
  const fieldLabels: Record<SelectionFilterKey, string> = {
    ...dimensionLabels,
    category: tr('Кафедра', 'Department'),
    direction: tr('Напрямок', 'Direction'),
    asset: tr('Засіб', 'Asset'),
    group: tr('Екіпаж', 'Crew'),
    purpose: tr('Мета вильоту', 'Flight purpose'),
    class_name: tr('Категорія цілей', 'Target category'),
    result: tr('Результат', 'Result'),
    ...configuredLabels,
  }
  const activeKeys = selectedFilterKeys(draft)
  const hiddenSavedKeys = activeKeys.filter((key) => !resolvedFields.some((field) => field.selectionKey === key && field.placement !== 'hidden'))
  const configuredField = (key: ConfiguredFilterKey) => config.filters.fields.find((field) => field.key === key)
  const organizationLabel = configuredField('organization')?.label || tr('Підрозділ', 'Organization')
  const displayedOptionLabel = (key: SelectionFilterKey, value: string) => {
    const option = (options?.[key] || []).find((item) => optionValue(item) === value)
    return configurationLabel(config, key, value, option ? optionLabel(option) : value)
  }
  const customVisible = customDefs.filter((definition) => definition.placement !== 'hidden' || isCustomValueActive(definition, customContext.values[definition.id]))
  const customMain = customVisible.filter((definition) => definition.placement === 'main')
  const customExtra = customVisible.filter((definition) => definition.placement !== 'main')
  const customExtraSelected = customExtra.filter((definition) => isCustomValueActive(definition, draftCustom[definition.id])).length
  const setCustom = (id: string, value: CustomFilterValue) => setDraftCustom((current) => ({ ...current, [id]: value }))
  const renderCustom = (definition: CustomFilterDefinition) => {
    const value = draftCustom[definition.id]
    if (definition.type === 'select') {
      const labels = new Map(definition.options.map((option) => [option.value, option.label]))
      return <MultiSelectFilter
        key={definition.id}
        custom
        label={definition.label}
        value={Array.isArray(value) ? value : []}
        options={definition.options.map((option) => option.value)}
        displayLabel={(item, fallback) => labels.get(item) ?? fallback}
        onChange={(next) => setCustom(definition.id, next)}
      />
    }
    if (definition.type === 'number_range') {
      const range: NumberRangeValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      return <div className="filter-field filter-field--custom filter-custom-field" title={tr('Фільтр, доданий адміністратором', 'Filter added by an administrator')} key={definition.id}>
        <span>{definition.label}</span>
        <div className="filter-custom-range">
          <input type="number" inputMode="decimal" aria-label={definition.label + ': ' + tr('від', 'from')} placeholder={tr('від', 'from')} value={range.min ?? ''} onChange={(event) => setCustom(definition.id, { ...range, min: event.target.value })} />
          <i aria-hidden="true">–</i>
          <input type="number" inputMode="decimal" aria-label={definition.label + ': ' + tr('до', 'to')} placeholder={tr('до', 'to')} value={range.max ?? ''} onChange={(event) => setCustom(definition.id, { ...range, max: event.target.value })} />
        </div>
      </div>
    }
    if (definition.type === 'text') {
      return <div className="filter-field filter-field--custom filter-custom-field" title={tr('Фільтр, доданий адміністратором', 'Filter added by an administrator')} key={definition.id}>
        <span>{definition.label}</span>
        <input type="search" aria-label={definition.label} placeholder={tr('Містить текст…', 'Contains text…')} value={typeof value === 'string' ? value : ''} onChange={(event) => setCustom(definition.id, event.target.value)} />
      </div>
    }
    return <div className="filter-field filter-field--custom filter-custom-field" title={tr('Фільтр, доданий адміністратором', 'Filter added by an administrator')} key={definition.id}>
      <span>{definition.label}</span>
      <select aria-label={definition.label} value={value === 'yes' || value === 'no' ? value : ''} onChange={(event) => setCustom(definition.id, event.target.value as CustomFilterValue)}>
        <option value="">{tr('Усі', 'All')}</option>
        <option value="yes">{tr('Так', 'Yes')}</option>
        <option value="no">{tr('Ні', 'No')}</option>
      </select>
    </div>
  }
  const appliedKeys = selectedFilterKeys(submittedFilters)
  const removeApplied = (keys: SelectionFilterKey[]) => {
    const next = cloneFilters(submittedFilters)
    for (const key of keys) next[key] = []
    if (comparison) comparison.onApply(next, cloneComparisonSettings(comparison.settings))
    else onChange(next)
  }
  const appliedChips = [
    ...appliedKeys.map((key) => ({
      id: key,
      label: fieldLabels[key],
      text: submittedFilters[key].map((value) => displayedOptionLabel(key, value)).join(', '),
      remove: () => removeApplied([key]),
    })),
    ...(showCustom ? customDefs.filter((definition) => isCustomValueActive(definition, customContext.values[definition.id])).map((definition) => ({
      id: 'custom:' + definition.id,
      label: definition.label,
      text: describeCustomValue(definition, customContext.values[definition.id]),
      remove: () => customContext.setValues({ ...customContext.values, [definition.id]: undefined }),
    })) : []),
  ]
  const visibleChipLimit = 6
  const clearApplied = () => { removeApplied(appliedKeys); if (showCustom) customContext.setValues({}) }
  const openPanel = () => { restoreSubmitted(); setStep(0); setPanelOpen(true) }
  const renderField = (field: typeof resolvedFields[number]) => <MultiSelectFilter
    key={field.key}
    label={field.label}
    value={draft[field.selectionKey]}
    options={options?.[field.selectionKey] || []}
    displayLabel={(value, fallback) => configurationLabel(config, field.selectionKey, value, fallback)}
    onChange={(value) => setDraftField(field.selectionKey, value)}
  />
  const buckets = temporalPeriodCount(draft.date_from, draft.date_to, draftSettings.granularity)
  const validationMessages = {
    period: tr('Перевірте період: кінцева дата або час не може передувати початковій.', 'Check the period: the end date or time cannot precede the start.'),
    reference: tr('Перевірте дати й час періоду для порівняння.', 'Check the dates and times of the comparison period.'),
    units: tr('Оберіть від 2 до 6 значень у полі «', 'Choose 2 to 6 values in “') + organizationLabel + tr('».', '”.'),
    workload: tr('До 24 періодів і 72 комбінацій підрозділ × період. Скоротіть діапазон, збільште крок періоду або оберіть менше значень.', 'Up to 24 periods and 72 unit-period combinations. Shorten the range, choose larger time buckets, or select fewer values.'),
  }
  const setSettingsField = <K extends keyof ComparisonFilterSettings>(key: K, value: ComparisonFilterSettings[K]) => {
    setDraftSettings((current) => ({ ...current, [key]: value }))
  }
  const setReferenceField = (key: keyof ComparisonFilterSettings['reference_period'], value: string) => {
    setDraftSettings((current) => ({
      ...current,
      reference_period: { ...current.reference_period, [key]: key === 'time_from' || key === 'time_to' ? value || undefined : value },
    }))
  }
  const temporalPreset = (granularity: ComparisonFilterSettings['granularity'], count: number) => {
    setDraft((current) => ({ ...current, ...temporalPresetRange(granularity, count, isoLocal(new Date())) }))
    setSettingsField('granularity', granularity)
    setDayMode('calendar')
  }
  const changeComparisonMode = (mode: ComparisonFilterSettings['mode']) => {
    const nextDimension = config.filters.organization_dimension
    setDraftSettings((current) => ({ ...current, mode, dimension: nextDimension }))
    setDraft((current) => canonicalOrganizationFilters(current, nextDimension))
  }
  const changeComparisonEnabled = (enabled: boolean) => {
    setDraftSettings((current) => ({ ...current, enabled, dimension: enabled ? config.filters.organization_dimension : current.dimension }))
    if (enabled) setDraft((current) => canonicalOrganizationFilters(current, config.filters.organization_dimension))
  }

  const renderPeriodInput = (side: 'from' | 'to') => {
    const isFrom = side === 'from'
    const date = isFrom ? draft.date_from : draft.date_to
    const time = isFrom ? draft.time_from : draft.time_to
    const label = isFrom ? tr('Початок періоду', 'Period start') : tr('Кінець періоду', 'Period end')
    const dateProps = isFrom ? { max: draft.date_to } : { min: draft.date_from }
    const setDate = (value: string) => changeCustomDate(isFrom ? 'date_from' : 'date_to', value)
    // Time of day is hidden by configuration: plain date.
    if (!showTimeControl) {
      return <input type="date" aria-label={label} value={date} {...dateProps} onChange={(event) => setDate(event.target.value)} />
    }
    // Reporting day: the time is fixed by the cutoff, only the date is editable.
    if (dayMode === 'reporting') {
      return <span className="period-range__reporting">
        <input type="date" aria-label={label} value={date} {...dateProps} onChange={(event) => setDate(event.target.value)} />
        <b title={tr('Час визначає зріз звітної доби', 'The time is set by the reporting-day cutoff')}>{(time || reportingCutoff).slice(0, 5)}</b>
      </span>
    }
    const bounds = isFrom
      ? { max: dateTimeValue(draft.date_to, draft.time_to, '23:59') }
      : { min: dateTimeValue(draft.date_from, draft.time_from, '00:00') }
    return <input
      type="datetime-local"
      aria-label={label}
      title={isFrom ? tr('Час 00:00 — з початку доби', 'Time 00:00 means from the start of the day') : tr('Час 23:59 — до кінця доби', 'Time 23:59 means until the end of the day')}
      value={dateTimeValue(date, time, isFrom ? '00:00' : '23:59')}
      {...bounds}
      onChange={(event) => changeDateTime(side, event.target.value)}
    />
  }

  return (
    <section className={'filters-section filters-section--compact filters-section--unified filters-section--configured' + (stepsLayout ? ' filters-section--steps' : '')}>
      <div className="filter-compact-bar">
        <button
          type="button"
          className={'filter-panel-trigger' + (panelOpen ? ' active' : '') + (dirty ? ' dirty' : '')}
          onClick={() => { if (panelOpen) closePanel(); else openPanel() }}
          aria-expanded={panelOpen}
          aria-label={tr('Фільтри', 'Filters')}
          aria-controls={panelId}
        >
          <SlidersHorizontal size={16} />
          <span>{tr('Фільтри', 'Filters')}</span>
          {appliedFilterValues > 0 && <span className="filter-panel-trigger__count">{appliedFilterValues}</span>}
          {dirty && <span className="filter-panel-trigger__pending" />}
        </button>
        <div className="filter-period-chip" title={appliedPeriodSummary}>
          <CalendarDays size={14} /><span>{appliedPeriodSummary}</span>
        </div>
        {comparison?.settings.enabled && <span className="filter-comparison-chip">{tr('Порівняння', 'Comparison')}</span>}
        {!panelOpen && !comparison && <div className="quick-row filter-bar-quick" role="group" aria-label={tr('Швидкий період', 'Quick period')}>
          {quick.map((item) => <button type="button" key={item.key} className={activeQuick === item.key ? 'selected' : ''} aria-pressed={activeQuick === item.key} onClick={() => applyQuickPeriod(buildQuickPeriod(item.days, item.offset))}>{quickLabel(item.key, tr)}</button>)}
          <button type="button" className={activeQuick === 'thisMonth' ? 'selected' : ''} aria-pressed={activeQuick === 'thisMonth'} onClick={() => applyQuickPeriod(buildMonthPeriod())}>{tr('Цей місяць', 'This month')}</button>
        </div>}
        {appliedChips.length > 0 && <div className="filter-applied" role="list" aria-label={tr('Застосовані фільтри', 'Applied filters')}>
          {appliedChips.slice(0, visibleChipLimit).map((chip) => <span key={chip.id} role="listitem" className="filter-applied-chip" title={chip.label + ': ' + chip.text}>
            <b>{chip.label}</b><span>{chip.text}</span>
            {!comparison && <button type="button" onClick={chip.remove} aria-label={tr('Прибрати фільтр: ', 'Remove filter: ') + chip.label}><X size={12} /></button>}
          </span>)}
          {appliedChips.length > visibleChipLimit && <button type="button" className="filter-applied-more" onClick={openPanel}>{tr('ще', 'more')} +{appliedChips.length - visibleChipLimit}</button>}
          {!comparison && appliedChips.length > 1 && <button type="button" className="filter-applied-clear" onClick={clearApplied}>{tr('Скинути все', 'Clear all')}</button>}
        </div>}
      </div>
      {panelOpen && <>
        <div id={panelId} className="filter-panel-shell" role="region" aria-label={tr('Фільтри аналітики', 'Analytics filters')}>
          <div className="filter-panel-header">
            <div><strong>{tr('Фільтри', 'Filters')}</strong></div>
            <button type="button" className="filter-panel-close" onClick={closePanel} aria-label={tr('Закрити', 'Close')}><X size={18} /></button>
          </div>
          {stepsLayout && <nav className="filter-configuration-steps" aria-label={tr('Кроки вибору', 'Selection steps')}>
            {[tr('Коли', 'When'), tr('Що показати', 'What to show'), ...(comparison ? [tr('Порівняння', 'Comparison')] : [])].map((label, index) => <button key={index} type="button" className={step === index ? 'active' : ''} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}
          </nav>}
          <div className="filter-panel-scroll">
            <div className="filter-configuration-period" hidden={stepsLayout && step !== 0}>
            <span className="filter-configuration-section-title">{tr('Період', 'Period')}</span>
            <div className="filter-period-row">
              <div className="period-range" role="group" aria-label={tr('Період', 'Period')}>
                <label className="period-range__field"><span>{tr('Від', 'From')}</span>{renderPeriodInput('from')}</label>
                <i className="period-range__arrow" aria-hidden="true">→</i>
                <label className="period-range__field"><span>{tr('До', 'To')}</span>{renderPeriodInput('to')}</label>
              </div>
              <div className="quick-row filter-panel-quick-row">
                {comparison && draftSettings.enabled && draftSettings.mode === 'units_over_time' ? <>
                  <button type="button" onClick={() => temporalPreset('day', 7)}>{tr('Останні 7 днів', 'Last 7 days')}</button>
                  <button type="button" onClick={() => temporalPreset('week', 4)}>{tr('Останні 4 тижні', 'Last 4 weeks')}</button>
                  <button type="button" onClick={() => temporalPreset('month', 6)}>{tr('Останні 6 місяців', 'Last 6 months')}</button>
                  <button type="button" onClick={() => temporalPreset('quarter', 4)}>{tr('Останні 4 квартали', 'Last 4 quarters')}</button>
                </> : <>
                  {quick.map((item) => <button type="button" key={item.key} className={activeQuick === item.key ? 'selected' : ''} onClick={() => setQuick(item.days, item.offset)}>{quickLabel(item.key, tr)}</button>)}
                  <button type="button" className={activeQuick === 'thisMonth' ? 'selected' : ''} onClick={thisMonth}>{tr('Цей місяць', 'This month')}</button>
                </>}
              </div>
              {showTimeControl && <div className="filter-day-mode">
                <div className="period-mode-switch" role="group" aria-label={tr('Режим періоду', 'Period mode')}>
                  <button type="button" className={dayMode === 'calendar' ? 'active' : ''} aria-pressed={dayMode === 'calendar'} onClick={() => changeDayMode('calendar')}><CalendarDays size={14} />{tr('Звичайна доба', 'Calendar day')}</button>
                  <button type="button" className={dayMode === 'reporting' ? 'active' : ''} aria-pressed={dayMode === 'reporting'} onClick={() => changeDayMode('reporting')}><Clock3 size={14} />{tr('Звітна доба', 'Reporting day')}</button>
                </div>
                {dayMode === 'reporting' && <div className="report-cutoff-switch" role="group" aria-label={tr('Зріз звітної доби', 'Reporting day cutoff')}>{reportingCutoffs.map((cutoff) => <button type="button" key={cutoff} className={reportingCutoff === cutoff ? 'active' : ''} aria-pressed={reportingCutoff === cutoff} onClick={() => changeReportingCutoff(cutoff)}>{cutoff} → {cutoff}</button>)}</div>}
              </div>}
            </div>
            </div>

            <div className="filter-configuration-selection" hidden={stepsLayout && step !== 1}>
            <div className="filters-grid expanded filter-panel-grid filter-unified-basic">
              {mainFields.map(renderField)}
              {customMain.map(renderCustom)}
            </div>
            {comparisonUnits && <p className="filter-unified-hint filter-organization-hint">{organizationLabel + ': ' + dimensionLabels[organizationDimension]}. {tr('Оберіть 2–6 значень для порівняння.', 'Choose 2–6 values to compare.')}</p>}
            {(extraFields.length > 0 || customExtra.length > 0) && <details className="filter-unified-details filter-extra-settings">
              <summary>{tr('Уточнити вибірку', 'Refine selection')}{extraSelected + customExtraSelected > 0 && <span>{extraSelected + customExtraSelected}</span>}</summary>
              <div className="filters-grid expanded filter-panel-grid filter-unified-details-body">
                {extraFields.map(renderField)}
                {customExtra.map(renderCustom)}
              </div>
            </details>}
            </div>

            {comparison && <div className="filter-comparison-setup" hidden={stepsLayout && step !== 2}>
              <label className="filter-comparison-toggle"><input type="checkbox" checked={draftSettings.enabled} onChange={(event) => changeComparisonEnabled(event.target.checked)} /><span>{tr('Порівняти', 'Compare')}</span></label>
              {draftSettings.enabled && <>
                <div className="filter-comparison-fields">
                  <label className="filter-unified-select"><span>{tr('Що порівнювати', 'What to compare')}</span><select aria-label={tr('Що порівнювати', 'What to compare')} value={draftSettings.mode} onChange={(event) => changeComparisonMode(event.target.value as ComparisonFilterSettings['mode'])}>
                    <option value="periods">{tr('Періоди', 'Periods')}</option><option value="units">{tr('Підрозділи', 'Units')}</option><option value="units_over_time">{tr('Підрозділи за періодами', 'Units over time')}</option>
                  </select></label>
                  {draftSettings.mode === 'periods' ? <label className="filter-unified-select"><span>{tr('Базовий період', 'Reference period')}</span><select aria-label={tr('Базовий період', 'Reference period')} value={draftSettings.reference} onChange={(event) => setSettingsField('reference', event.target.value as ComparisonFilterSettings['reference'])}>
                    <option value="previous">{tr('Попередній такої самої тривалості', 'Previous period of equal duration')}</option><option value="custom">{tr('Власний період', 'Custom period')}</option>
                  </select></label> : <>
                    {draftSettings.mode === 'units_over_time' && <label className="filter-unified-select"><span>{tr('Крок періоду', 'Time bucket')}</span><select aria-label={tr('Крок періоду', 'Time bucket')} value={draftSettings.granularity} onChange={(event) => setSettingsField('granularity', event.target.value as ComparisonFilterSettings['granularity'])}><option value="day">{tr('День', 'Day')}</option><option value="week">{tr('Тиждень', 'Week')}</option><option value="month">{tr('Місяць', 'Month')}</option><option value="quarter">{tr('Квартал', 'Quarter')}</option></select></label>}
                  </>}
                </div>
                {draftSettings.mode === 'periods' && draftSettings.reference === 'custom' && <div className="filter-reference-fields">
                  <label className="period-field"><span>{tr('Порівняння: дата від', 'Comparison: date from')}</span><input type="date" value={draftSettings.reference_period.date_from} onChange={(event) => setReferenceField('date_from', event.target.value)} /></label>
                  <label className="period-field"><span>{tr('Порівняння: час від', 'Comparison: time from')}</span><input type="time" step="0.001" value={draftSettings.reference_period.time_from || ''} onChange={(event) => setReferenceField('time_from', event.target.value)} /></label>
                  <label className="period-field"><span>{tr('Порівняння: дата до', 'Comparison: date to')}</span><input type="date" value={draftSettings.reference_period.date_to} onChange={(event) => setReferenceField('date_to', event.target.value)} /></label>
                  <label className="period-field"><span>{tr('Порівняння: час до', 'Comparison: time to')}</span><input type="time" step="0.001" value={draftSettings.reference_period.time_to || ''} onChange={(event) => setReferenceField('time_to', event.target.value)} /></label>
                </div>}
                <p className="filter-unified-hint">{draftSettings.mode === 'periods' ? tr('Ті самі фільтри застосовуються до обох періодів.', 'Both periods use the same filters.') : <>{tr('Використовуються значення поля «', 'Selections from “')}{organizationLabel}{tr('». ', '” are used. ')}{draftSettings.mode === 'units_over_time' ? tr('Кожне порівнюється зі своїм попереднім періодом; тижні починаються в понеділок.', 'Each is compared with its own preceding period; weeks start on Monday.') : tr('Перше вибране значення є базою порівняння.', 'The first selected value is the reference.')}</>}</p>
                {stepsLayout && draftSettings.mode !== 'periods' && <button type="button" className="filter-configuration-edit-selection" onClick={() => setStep(1)}>{tr('Обрати підрозділи', 'Choose organizations')}</button>}
                {draftSettings.mode === 'units_over_time' && <p className="filter-unified-hint">{tr('До 24 періодів і 72 комбінацій підрозділ × період.', 'Up to 24 periods and 72 unit-period combinations.')} {tr('У діапазоні', 'In range')}: {buckets > 24 ? '24+' : buckets} × {draft[dimension].length}. {tr('Швидкий діапазон включає поточний період до сьогодні та скидає час.', 'Quick ranges include the current period through today and clear time cutoffs.')}</p>}
              </>}
            </div>}

            {hiddenSavedKeys.length > 0 && <div className="filter-configuration-active">
              <span>{tr('Збережені приховані фільтри', 'Saved hidden filters')}</span>
              <div className="filter-configuration-chips">
                {hiddenSavedKeys.map((key) => {
                  const values = draft[key]
                  const summary = values.map((value) => displayedOptionLabel(key, value)).join(', ')
                  const hidden = !resolvedFields.some((field) => field.selectionKey === key && field.placement !== 'hidden')
                  return <button key={key} type="button" title={summary} className={hidden ? 'filter-selection-chip filter-selection-chip--saved' : 'filter-selection-chip'} onClick={() => setDraftField(key, [])} aria-label={tr('Прибрати фільтр: ', 'Remove filter: ') + fieldLabels[key]}><span>{fieldLabels[key]}: {displayedOptionLabel(key, values[0])}{values.length > 1 && ` +${values.length - 1}`}{hidden && <small>{tr('збережений', 'saved')}</small>}</span><X size={13} /></button>
                })}
              </div>
              <p>{tr('Збережені приховані фільтри залишаються активними. Натисніть на позначку, щоб прибрати їх.', 'Saved hidden filters remain active. Select a chip to remove them.')}</p>
            </div>}
          </div>
          <div className={'filter-panel-footer' + (dirty ? ' dirty' : '') + (validation ? ' invalid' : '')}>
            <div className="filter-apply-status" role={validation ? 'status' : undefined}>
              {validation ? <><span className="pending-dot" />{validationMessages[validation]}</> : dirty ? <><span className="pending-dot" />{tr('Є незастосовані зміни', 'There are unapplied changes')}</> : <>{tr('Зміни застосовуються однією кнопкою', 'Apply all changes with one button')}</>}
            </div>
            <div className="filter-global-actions">
              {stepsLayout && step > 0 && <button type="button" className="filter-configuration-step-button" onClick={() => setStep((current) => current - 1)}>{tr('Назад', 'Back')}</button>}
              {stepsLayout && step < (comparison ? 2 : 1) && <button type="button" className="filter-configuration-step-button" onClick={() => setStep((current) => current + 1)}>{tr('Далі', 'Next')}</button>}
              <button type="button" className="filter-reset-button" onClick={resetSelections} disabled={!activeFilterValues && !customDraftCount && !draftSettings.enabled}><RotateCcw size={15} />{tr('Скинути', 'Reset')}</button>
              <button type="button" className="filter-apply-button" onClick={applyFilters} disabled={!canApply}><Check size={16} />{tr('Застосувати', 'Apply')}</button>
            </div>
          </div>
        </div>
      </>}
    </section>
  )
}
