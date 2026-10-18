// "What's new": changes shown to users and highlighted where they live in the app.
// Add an entry here with each user-visible change; the newest entry goes first.
export type WhatsNewTarget = {
  /** Page the change is on (sidebar item). */
  page?: string
  /** Statistics section tab. */
  section?: string
  /** Widgets: widget ID, built-in report ("map", "losses") or visualization type ("position_board"). */
  widgets?: string[]
}
export type WhatsNewEntry = { id: string; version: string; date: string; title: string; text: string; target?: WhatsNewTarget }

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '2026-10-18-effectiveness', version: '0.9.0', date: '2026-10-18',
    title: 'Результативність: правила для кожної мети й мінус за втрату',
    text: 'В Адмініструванні → KPI для кожної мети задається, коли виліт результативний. Розвідка рахується результативною, лише якщо під час вильоту було виявлення, дорозвідка чи зйомка ураження. Нерезультативний виліт із втратою борту може віднімати один результативний, тому результативність буває від’ємною.',
    target: { page: 'statistics', section: 'positions', widgets: ['position_board'] },
  },
  {
    id: '2026-10-18-speed', version: '0.9.0', date: '2026-10-18',
    title: 'Швидше відкриття сторінок',
    text: 'Дашборд і статистика за швидкими періодами (сьогодні, вчора, 7/14/30 днів, місяць, звітна доба) рахуються заздалегідь у фоні й відкриваються майже миттєво.',
    target: { page: 'dashboard' },
  },
  {
    id: '2026-10-18-losses', version: '0.8.0', date: '2026-10-18',
    title: 'Втрати: зведення по засобах і позиціях',
    text: 'Замість списку бортів — кількість втрат по кожному засобу. FPV, FPV ППО й Ударні крила, які уразили або знищили ціль, не вважаються втратами й показуються окремо. Для багаторазових засобів видно, на яких позиціях їх втрачено.',
    target: { page: 'dashboard', section: 'losses', widgets: ['losses'] },
  },
  {
    id: '2026-10-18-map', version: '0.8.0', date: '2026-10-18',
    title: 'Карта: цілі, лінія фронту й окупована територія',
    text: 'Уражені (жовті) і знищені (червоні) цілі. Наведіть на ціль, щоб побачити всі ураження по порядку; клік на кружок із числом відкриває список цілей. Темна підкладка, лінія фронту й окупована територія; шари можна вмикати й ховати.',
    target: { page: 'map', widgets: ['map'] },
  },
  {
    id: '2026-10-17-positions', version: '0.8.0', date: '2026-10-17',
    title: 'Статистика → Позиції: вильоти вдень і вночі',
    text: 'Хто скільки літав вдень і вночі: кафедри, їхні позиції та екіпажі, з пошуком і сортуванням. Клік на день у «Динаміці вильотів» відкриває позиції за цей день.',
    target: { page: 'statistics', section: 'positions', widgets: ['position_board', 'main-timeline'] },
  },
  {
    id: '2026-10-16-comparison', version: '0.8.0', date: '2026-10-16',
    title: 'Порівняння «Усі області»: оцінка за місіями',
    text: 'Області порівнюються з тими, хто виконує ті самі місії; складніші місії (ураження, мінування) важать більше. Оцінка — від 1 до 5 зірок.',
    target: { page: 'comparison' },
  },
]

/** Highlights end on their own after this many days. */
export const WHATS_NEW_DAYS = 30

export function activeEntries(entries: WhatsNewEntry[], seen: ReadonlySet<string>, today = new Date()): WhatsNewEntry[] {
  const limit = today.getTime() - WHATS_NEW_DAYS * 86_400_000
  return entries.filter(entry => !seen.has(entry.id) && new Date(`${entry.date}T00:00:00`).getTime() >= limit)
}

export function entriesFor(entries: WhatsNewEntry[], where: { page?: string; section?: string; widget?: (string | null | undefined)[] }) {
  return entries.filter(entry => {
    const target = entry.target
    if (!target) return false
    if (where.widget) return where.widget.some(key => key && target.widgets?.includes(key))
    if (where.section) return target.section === where.section
    // Statistics sections live on the statistics page.
    return target.page === where.page || (where.page === 'statistics' && Boolean(target.section))
  })
}

export function formatBuild(version: string, buildDate: string, commit: string) {
  const date = buildDate ? new Date(buildDate) : null
  const day = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
  return [`v${version}`, day, commit].filter(Boolean).join(' · ')
}
