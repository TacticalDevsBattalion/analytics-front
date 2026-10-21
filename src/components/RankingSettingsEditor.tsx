import { Plus, RotateCcw, Trash2, Trophy } from 'lucide-react'
import { defaultRankingConfiguration, type RankingConfiguration, type RankingMissionGroup } from '../config/appConfiguration'
import './RankingSettingsEditor.css'

const WEIGHTS: Array<{ key: keyof RankingConfiguration['weights']; label: string; hint: string }> = [
  { key: 'avg_flights', label: 'Середня кількість вильотів за добу', hint: 'У дні, коли екіпаж виконував такі місії. Більше — краще.' },
  { key: 'efficiency', label: 'Результативність', hint: 'За правилами розділу «Розрахунок KPI». Більше — краще.' },
  { key: 'loss_rate', label: 'Втрати бортів на виліт', hint: 'Менше — краще. Можна вимкнути для окремих кафедр у групі місій.' },
]
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk')

export function validateRanking(value: RankingConfiguration | undefined): string {
  if (!value) return ''
  if (!Number.isInteger(value.min_flights) || value.min_flights < 1 || value.min_flights > 1000) return 'Мінімум вильотів для рейтингу — ціле число від 1 до 1000.'
  const weights = Object.values(value.weights)
  if (weights.some(weight => !Number.isFinite(weight) || weight < 0 || weight > 10)) return 'Вага критерію рейтингу — число від 0 до 10.'
  if (!weights.some(weight => weight > 0)) return 'У рейтингу хоча б один критерій має мати вагу більше нуля.'
  if (value.mission_groups.some(group => !group.title.trim())) return 'У кожної групи місій рейтингу має бути назва.'
  const purposes = value.mission_groups.flatMap(group => group.purposes.map(normalize))
  if (new Set(purposes).size !== purposes.length) return 'Кожна мета вильоту може входити лише в одну групу місій рейтингу.'
  return ''
}

function newId(groups: RankingMissionGroup[]) {
  let index = groups.length + 1
  while (groups.some(group => group.id === `group_${index}`)) index++
  return `group_${index}`
}

/** Which missions are ranked together, how much each criterion counts and how many flights a crew needs. */
export function RankingSettingsEditor({ value, purposes, categories, onChange }: { value: RankingConfiguration | undefined; purposes: string[]; categories: string[]; onChange: (value: RankingConfiguration) => void }) {
  const settings = value ?? defaultRankingConfiguration()
  const update = (change: (draft: RankingConfiguration) => void) => { const draft = structuredClone(settings); change(draft); onChange(draft) }
  const assigned = new Map(settings.mission_groups.flatMap(group => group.purposes.map(purpose => [normalize(purpose), group.title] as const)))
  const unassigned = purposes.filter(purpose => !assigned.has(normalize(purpose)))
  // Values chosen earlier stay visible even if the current period has no such flights.
  const allPurposes = [...new Set([...purposes, ...settings.mission_groups.flatMap(group => group.purposes)])].sort((a, b) => a.localeCompare(b, 'uk'))
  const allCategories = [...new Set([...categories, ...settings.mission_groups.flatMap(group => group.ignore_losses_for)])].sort((a, b) => a.localeCompare(b, 'uk'))
  const toggle = (list: string[], item: string) => list.some(entry => normalize(entry) === normalize(item)) ? list.filter(entry => normalize(entry) !== normalize(item)) : [...list, item]

  return <div className="ranking-settings">
    <div className="admin-section-heading"><Trophy size={20} /><div><h3>Рейтинг екіпажів</h3><p>Екіпажі порівнюються в межах своєї кафедри і групи місій: ті, хто виконував лише безпечну логістику, не змагаються з ударними. Загальний бал — середнє балів за групами, зважене за кількістю вильотів. Діє після публікації.</p></div>
      <button type="button" className="secondary" onClick={() => onChange(defaultRankingConfiguration())}><RotateCcw size={15} /> Типові налаштування</button></div>

    <h4>Критерії та їхня вага</h4>
    <p className="admin-hint">За кожним критерієм екіпаж отримує 0–100: яку частку екіпажів своєї кафедри й групи місій він випереджає. Бал — середнє з цими вагами; 0 — не враховувати критерій.</p>
    <div className="ranking-settings__weights">
      {WEIGHTS.map(item => <label key={item.key}><span>{item.label}<small>{item.hint}</small></span>
        <input type="number" min={0} max={10} step={0.5} value={settings.weights[item.key]} onChange={event => update(draft => { draft.weights[item.key] = Number(event.target.value) })} /></label>)}
      <label><span>Мінімум вильотів<small>Група місій враховується для екіпажу, якщо в ній щонайменше стільки вильотів.</small></span>
        <input type="number" min={1} max={1000} step={1} value={settings.min_flights} onChange={event => update(draft => { draft.min_flights = Math.round(Number(event.target.value)) })} /></label>
    </div>

    <h4>Групи місій</h4>
    <p className="admin-hint">Цілі вильотів, що не входять у жодну групу, оцінюються разом як «Інші місії».{unassigned.length > 0 && <> Зараз поза групами: <b>{unassigned.join(', ')}</b>.</>}</p>
    <div className="ranking-settings__groups">
      {settings.mission_groups.map((group, index) => <fieldset key={group.id} className="ranking-settings__group">
        <legend><input aria-label="Назва групи місій" value={group.title} maxLength={80} onChange={event => update(draft => { draft.mission_groups[index].title = event.target.value })} />
          <button type="button" className="secondary" aria-label={`Видалити групу ${group.title}`} onClick={() => update(draft => { draft.mission_groups.splice(index, 1) })}><Trash2 size={15} /></button></legend>
        <span className="ranking-settings__label">Цілі вильотів</span>
        <div className="ranking-settings__chips">{allPurposes.map(purpose => {
          const owner = assigned.get(normalize(purpose))
          const mine = group.purposes.some(entry => normalize(entry) === normalize(purpose))
          if (owner && !mine) return null
          return <label key={purpose} className={mine ? 'active' : ''}><input type="checkbox" checked={mine} onChange={() => update(draft => { draft.mission_groups[index].purposes = toggle(draft.mission_groups[index].purposes, purpose) })} />{purpose}</label>
        })}</div>
        <span className="ranking-settings__label">Не враховувати втрати бортів для кафедр <small>(де борт за задумом не повертається, наприклад FPV на ударних місіях)</small></span>
        <div className="ranking-settings__chips">{allCategories.map(category => {
          const mine = group.ignore_losses_for.some(entry => normalize(entry) === normalize(category))
          return <label key={category} className={mine ? 'active' : ''}><input type="checkbox" checked={mine} onChange={() => update(draft => { draft.mission_groups[index].ignore_losses_for = toggle(draft.mission_groups[index].ignore_losses_for, category) })} />{category}</label>
        })}</div>
      </fieldset>)}
    </div>
    {settings.mission_groups.length < 20 && <button type="button" className="secondary" onClick={() => update(draft => { draft.mission_groups.push({ id: newId(draft.mission_groups), title: 'Нова група', purposes: [], ignore_losses_for: [] }) })}><Plus size={15} /> Додати групу місій</button>}
  </div>
}
