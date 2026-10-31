import { useRef } from 'react'
import { SEASONS, SUN_TIMES, normalizeSun, seasonFor } from '../lib/sunShadows.js'

const DIRECTIONS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

function SunTimeIcon({ time }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {time === 'night' ? <path d="M20.5 13.1A8.5 8.5 0 0 1 10.9 3.5a8.5 8.5 0 1 0 9.6 9.6Z"/> : time === 'morning' || time === 'afternoon' ? <>
      <path d="M8 16a4 4 0 0 1 8 0M3 16h2m14 0h2M5 8l2 2m10 0 2-2M3 20h18M12 2v6"/>
      <path d={time === 'morning' ? 'm9 5 3-3 3 3' : 'm9 5 3 3 3-3'}/>
    </> : <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>}
  </svg>
}

/** Roving-tabindex radio group: arrows, Home and End move the choice, as in the WAI-ARIA radio pattern. */
function RadioRow({ label, items, selected, onChoose, render, title }) {
  const buttons = useRef([])
  const index = Math.max(0, selected)
  function choose(next) {
    const i = (next + items.length) % items.length
    onChoose(items[i])
    buttons.current[i]?.focus({ preventScroll: true })
  }
  function keyDown(event, i) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (!(event.key in DIRECTIONS) && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    event.stopPropagation()
    choose(event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : i + DIRECTIONS[event.key])
  }
  return <div role="radiogroup" aria-label={label}>
    {items.map((item, i) => <button key={item.id} ref={node => { buttons.current[i] = node }} type="button" role="radio" aria-checked={i === selected} aria-label={item.label}
      title={title(item)} tabIndex={i === index ? 0 : -1} onClick={() => choose(i)} onKeyDown={event => keyDown(event, i)}>{render(item)}</button>)}
  </div>
}

export default function SunTimeControl({ value, onChange }) {
  const sun = normalizeSun(value), season = seasonFor(sun.season)
  return <div className="map-sun-toggle" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <RadioRow label="Day of year for shadows" items={SEASONS} selected={SEASONS.findIndex(s => s.id === sun.season)} onChoose={s => onChange(normalizeSun({ season: s.id, hour: sun.hour }))}
      title={s => `${s.label} · ${s.date}`} render={s => <span className="sun-season">{s.short}</span>}/>
    <span className="sun-divider" aria-hidden="true"/>
    <RadioRow label={`Time of day for shadows (${season.label.toLowerCase()})`} items={SUN_TIMES} selected={SUN_TIMES.findIndex(t => t.hour === sun.hour)} onChoose={t => onChange({ season: sun.season, hour: t.hour })}
      title={t => `${t.label} · ${t.hour}:00 solar time, ${season.label.toLowerCase()}`} render={t => <SunTimeIcon time={t.id}/>}/>
  </div>
}
