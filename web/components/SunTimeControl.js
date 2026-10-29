import { useRef } from 'react'
import { SUN_TIMES } from '../lib/sunShadows.js'

const DIRECTIONS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

function SunTimeIcon({ time }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {time === 'night' ? <path d="M20.5 13.1A8.5 8.5 0 0 1 10.9 3.5a8.5 8.5 0 1 0 9.6 9.6Z"/> : time === 'morning' || time === 'afternoon' ? <>
      <path d="M8 16a4 4 0 0 1 8 0M3 16h2m14 0h2M5 8l2 2m10 0 2-2M3 20h18M12 2v6"/>
      <path d={time === 'morning' ? 'm9 5 3-3 3 3' : 'm9 5 3 3 3-3'}/>
    </> : <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>}
  </svg>
}

export default function SunTimeControl({ value, onChange }) {
  const buttons = useRef([])
  const selected = Math.max(0, SUN_TIMES.findIndex(time => time.id === value))

  function choose(index) {
    const next = (index + SUN_TIMES.length) % SUN_TIMES.length
    onChange(SUN_TIMES[next].id)
    buttons.current[next]?.focus({ preventScroll: true })
  }

  function keyDown(event, index) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (!(event.key in DIRECTIONS) && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    event.stopPropagation()
    choose(event.key === 'Home' ? 0 : event.key === 'End' ? SUN_TIMES.length - 1 : index + DIRECTIONS[event.key])
  }

  return <div className="map-sun-toggle" role="radiogroup" aria-label="Sun position for shadows (equinox)" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    {SUN_TIMES.map((time, index) => <button key={time.id} ref={node => { buttons.current[index] = node }} type="button" role="radio" aria-checked={value === time.id} aria-label={time.label}
      title={`${time.label} · ${time.hour}:00 (equinox solar time)`} tabIndex={index === selected ? 0 : -1} onClick={() => choose(index)} onKeyDown={event => keyDown(event, index)}>
      <SunTimeIcon time={time.id}/>
    </button>)}
  </div>
}
