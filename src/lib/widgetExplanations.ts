// "How is this calculated": plain-language notes for widgets. Built-in reports have
// their own text; other widgets list the descriptions of their metrics.
export type Explanation = { lead?: string; items: { term: string; text: string }[] }
export type MetricText = { title?: string; label?: string; description?: string }

const GENERIC = new Set(['', 'Деталізований системний показник'])

const BUILTIN: Record<string, Explanation> = {
  losses: {
    lead: 'Скільки засобів втрачено за період, по кафедрах і засобах.',
    items: [
      { term: 'Одноразові (FPV, FPV ППО, Ударні крила)', text: 'Втрата — борт, який не уразив і не знищив ціль. Ті, що уразили або знищили, витрачені за призначенням: вони показані окремо й у втрати не входять.' },
      { term: 'Багаторазові (Mavic, Бомбери, Крило, НРК)', text: 'Кожен запис про втрату борту — втрата, незалежно від результату вильоту. Позиція — та, з якої був виліт.' },
    ],
  },
  map: {
    lead: 'Цілі з записів «Уражено» і «Знищено», що мають координати MGRS.',
    items: [
      { term: 'Точка', text: 'Одна ціль (за її ID). Стоїть там, де ціль знищили, або в місці останнього ураження. Більша точка — більше уражень.' },
      { term: 'Кольори', text: 'Червоний — знищена, жовтий — лише уражена. Червоний кружок із числом містить хоча б одну знищену ціль.' },
      { term: 'Окупована територія', text: 'Кордон України мінус підконтрольна територія з останнього завантаження; лінія фронту — межа між ними.' },
    ],
  },
  timeline: {
    lead: 'Вильоти за календарними днями.',
    items: [
      { term: 'День і ніч', text: 'Денний період — за налаштуванням, типово 07:00–19:00 за київським часом. Вильоти без часу рахуються як нічні.' },
      { term: 'Клік на день', text: 'Відкриває «Статистика → Позиції» за цей день.' },
    ],
  },
  position_board: {
    lead: 'Хто скільки літав вдень і вночі: кафедри → позиції → екіпажі.',
    items: [
      { term: 'Вдень / вночі', text: 'Денний період — типово 07:00–19:00 за київським часом; решта й вильоти без часу — ніч.' },
      { term: 'Смуга', text: 'Довжина — кількість вильотів позиції відносно найбільшої в списку; жовта частина — день, блакитна — ніч.' },
      { term: 'Результативність', text: 'На картці кафедри: (результативні − вильоти з втратою без результату) ÷ усі вильоти. Що вважається результативним для кожної мети — Адміністрування → KPI (наприклад, розвідка — лише з виявленням, дорозвідкою чи зйомкою ураження).' },
    ],
  },
}

export function explainWidget(widget: { builtin?: string | null; visualization?: { type?: string }; query?: { metrics?: { key: string }[] } }, metrics: Record<string, MetricText> = {}): Explanation | null {
  const base = (widget.builtin && BUILTIN[widget.builtin]) || (widget.visualization?.type && BUILTIN[widget.visualization.type]) || null
  const keys = widget.builtin === 'losses' || widget.builtin === 'map' ? [] : (widget.query?.metrics ?? []).map(metric => metric.key)
  const metricItems = keys.flatMap(key => {
    const text = metrics[key]?.description?.trim() ?? ''
    return GENERIC.has(text) ? [] : [{ term: metrics[key]?.title || metrics[key]?.label || key, text }]
  })
  if (!base && !metricItems.length) return null
  // Built-in notes come first; metric descriptions they already cover are not repeated.
  const items = [...(base?.items ?? []), ...(base ? metricItems.filter(item => !base.items.some(existing => existing.term === item.term)) : metricItems)]
  return { lead: base?.lead, items: widget.visualization?.type === 'position_board' ? base!.items : items }
}
