import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  CUSTOM_FILTER_TYPE_LABELS, formatCustomOptions, parseCustomOptions, slugifyFilterId,
  type CustomFilterDefinition, type CustomFilterPlacement, type CustomFilterType,
} from '../lib/customFilters'
import './CustomFilterEditor.css'

export type CustomFilterFieldOption = { key: string; label: string }
type Props = {
  value: CustomFilterDefinition[]
  /** Data fields the analytics engine accepts. Empty while the catalog is unavailable. */
  fields: CustomFilterFieldOption[]
  /** Real ClickHouse columns not covered by any built-in filter (key is the x_<column> field). */
  newColumns?: CustomFilterFieldOption[]
  newColumnsFailed?: boolean
  /** Ids already used by built-in filters. */
  reservedIds: string[]
  onChange: (next: CustomFilterDefinition[]) => void
}

const LIMIT = 20
const placementLabels: Record<CustomFilterPlacement, string> = { main: 'Основні фільтри', extra: 'Уточнити вибірку', hidden: 'Прихований' }

function OptionsText({ options, onChange }: { options: CustomFilterDefinition['options']; onChange: (next: CustomFilterDefinition['options']) => void }) {
  // The raw text is kept locally so that typing "=" or a trailing newline is not rewritten mid-edit.
  const [text, setText] = useState(() => formatCustomOptions(options))
  return <textarea rows={Math.min(8, Math.max(3, options.length + 1))} value={text} spellCheck={false} placeholder={'значення\nзначення = підпис для користувача'}
    onChange={event => { setText(event.target.value); onChange(parseCustomOptions(event.target.value)) }} />
}

export function CustomFilterEditor({ value, fields, newColumns = [], newColumnsFailed = false, reservedIds, onChange }: Props) {
  const update = (index: number, patch: Partial<CustomFilterDefinition>) => onChange(value.map((item, position) => position === index ? { ...item, ...patch } : item))
  const move = (index: number, direction: number) => {
    const target = index + direction
    if (target < 0 || target >= value.length) return
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const add = () => onChange([...value, {
    id: slugifyFilterId('', [...value.map(item => item.id), ...reservedIds]),
    label: 'Новий фільтр', field: fields[0]?.key ?? '', type: 'select', placement: 'extra', options: [],
  }])
  return <div className="custom-filters">
    <div className="custom-filters__head">
      <div><h4>Власні фільтри</h4><p className="admin-hint">Створіть фільтр для будь-якого поля даних: користувачі обиратимуть значення на панелі фільтрів без жодних запитів. Власні фільтри діють на сторінках Dashboard, Statistics, «Мій Dashboard» і порівняння ББАК/екіпажів.</p></div>
      <button type="button" className="admin-button" disabled={value.length >= LIMIT} onClick={add}><Plus size={15} />Додати фільтр</button>
    </div>
    {newColumnsFailed && <p className="admin-hint">Не вдалося прочитати колонки ClickHouse — доступні лише поля вбудованих фільтрів.</p>}
    {value.length === 0 && <p className="custom-filters__empty">Власних фільтрів ще немає.</p>}
    {value.map((item, index) => {
      const known = fields.some(field => field.key === item.field) || newColumns.some(field => field.key === item.field)
      return <fieldset className="custom-filter" key={item.id}>
        <div className="custom-filter__row">
          <label><span>Назва на панелі</span><input value={item.label} maxLength={80} onChange={event => update(index, { label: event.target.value })} /></label>
          <label><span>Поле даних</span>
            {fields.length > 0
              ? <select value={item.field} onChange={event => update(index, { field: event.target.value })}>
                {!known && <option value={item.field}>{item.field || 'Оберіть поле'}</option>}
                <optgroup label="Поля вбудованих фільтрів">{fields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</optgroup>
                {newColumns.length > 0 && <optgroup label="Нові колонки ClickHouse (таблиця вильотів)">{newColumns.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</optgroup>}
              </select>
              : <input value={item.field} placeholder="Наприклад, bc_name" onChange={event => update(index, { field: event.target.value.trim() })} />}
          </label>
          <label><span>Тип</span><select value={item.type} onChange={event => {
            const type = event.target.value as CustomFilterType
            update(index, { type, options: type === 'select' ? item.options : [] })
          }}>{(Object.keys(CUSTOM_FILTER_TYPE_LABELS) as CustomFilterType[]).map(type => <option key={type} value={type}>{CUSTOM_FILTER_TYPE_LABELS[type]}</option>)}</select></label>
          <label><span>Розміщення</span><select value={item.placement} onChange={event => update(index, { placement: event.target.value as CustomFilterPlacement })}>
            {(Object.keys(placementLabels) as CustomFilterPlacement[]).map(key => <option key={key} value={key}>{placementLabels[key]}</option>)}
          </select></label>
          <div className="custom-filter__tools">
            <div className="admin-order">
              <button type="button" aria-label={`Підняти: ${item.label}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
              <button type="button" aria-label={`Опустити: ${item.label}`} disabled={index === value.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
            </div>
            <button type="button" className="custom-filter__delete" aria-label={`Видалити фільтр: ${item.label}`} onClick={() => onChange(value.filter((_, position) => position !== index))}><Trash2 size={15} /></button>
          </div>
        </div>
        {item.type === 'select' && <label className="custom-filter__options"><span>Значення для вибору — по одному в рядку, «значення = підпис» (підпис необов’язковий)</span>
          <OptionsText options={item.options} onChange={options => update(index, { options })} />
          <small>{item.options.length} / 200 значень. Значення зіставляються з даними так, як вони записані в джерелі.</small>
        </label>}
        {item.type === 'number_range' && <p className="admin-hint">Користувач вказує «від» і «до»; порожня межа означає відсутність обмеження.</p>}
        {item.type === 'text' && <p className="admin-hint">Показуються записи, у яких поле містить введений текст (без урахування регістру).</p>}
        {item.type === 'boolean' && <p className="admin-hint">Перемикач «Усі / Так / Ні» для полів зі значенням так/ні (наприклад, 1 або 0).</p>}
      </fieldset>
    })}
  </div>
}
