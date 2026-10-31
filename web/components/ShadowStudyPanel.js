import { useId } from 'react'
import { SEASONS, daylight, formatSolarHour, normalizeSun, seasonFor } from '../lib/sunShadows.js'
import { CEQR_MARGIN_H, SHADE_COVERAGE, formatHours } from '../lib/shadeStudy.js'

const CEQR_URL = 'https://www.nyc.gov/assets/oec/technical-manual/08_Shadows_2025.pdf'

/** Season and hour for the map's shadows, plus the hours of project shadow each neighbouring lot receives. */
export default function ShadowStudyPanel({ sun, onSun, enabled, onEnabled, study, buildings = 0, addressFor = () => null }) {
  const sliderId = useId(), value = normalizeSun(sun), season = seasonFor(value.season)
  const { sunrise, sunset } = daylight(undefined, season.declination)
  const min = Math.ceil((sunrise + .25) * 4) / 4, max = Math.floor((sunset - .25) * 4) / 4
  const shown = study?.neighbours.slice(0, 8) || []
  return <section className="shadow-study" aria-labelledby={`${sliderId}-title`}>
    <div className="section-heading"><h3 id={`${sliderId}-title`}>Shadow study</h3><span className="data-badge">Estimate</span></div>
    <div className="segmented shadow-seasons" role="group" aria-label="Representative day">{SEASONS.map(s => <button key={s.id} type="button" aria-pressed={value.season === s.id} title={s.date} onClick={() => onSun(normalizeSun({ season: s.id, hour: value.hour }))}>{s.label}</button>)}</div>
    <label htmlFor={sliderId}>Time of day <strong>{formatSolarHour(value.hour)}</strong> solar time · {season.date}</label>
    <input id={sliderId} type="range" min={min} max={max} step={.25} value={Math.min(max, Math.max(min, value.hour))} aria-valuetext={`${formatSolarHour(value.hour)} solar time`} onChange={event => onSun({ season: value.season, hour: Number(event.target.value) })}/>
    <small>Sunrise {formatSolarHour(sunrise)} · sunset {formatSolarHour(sunset)}. Solar noon in Pittsburgh is about 12:20 EST (1:20 EDT), varying by about ±15 min through the year.</small>
    <button type="button" className="lvt-toggle" aria-pressed={enabled} disabled={!buildings} onClick={() => onEnabled(!enabled)}>{enabled ? 'Showing shaded neighbours' : 'Show shaded neighbours'}</button>
    {!buildings && <small>Preview or add a building to see which neighbours it shades.</small>}
    {enabled && study && <div className="shadow-result" role="status">
      <p>{study.neighbours.length
        ? <>On the <strong>{season.label.toLowerCase()}</strong>, {buildings === 1 ? 'proposed building shades' : `${buildings} proposed buildings shade`} {study.neighbours.length === 1 ? '1 neighbouring lot' : `${study.neighbours.length} neighbouring lots`} between {formatSolarHour(study.window.start)} and {formatSolarHour(study.window.end)}.</>
        : <>No neighbouring lot is ≥ {Math.round(SHADE_COVERAGE * 100)}% in project shadow between {formatSolarHour(study.window.start)} and {formatSolarHour(study.window.end)} on the {season.label.toLowerCase()}.</>}</p>
      {!!shown.length && <ol className="shadow-list">{shown.map(n => <li key={n.pin}>
        <span><span>{addressFor(n.pin) || n.address || n.pin}</span><strong>{formatHours(n.hours)}</strong></span>
        <small>{formatSolarHour(n.first)}–{formatSolarHour(n.last)} · up to {Math.round(n.peak * 100)}% of the lot</small>
      </li>)}</ol>}
      {study.neighbours.length > shown.length && <small>+{study.neighbours.length - shown.length} more on the map.</small>}
    </div>}
    <details className="lvt-method">
      <summary>How hours are counted</summary>
      <p>The sun is sampled every 15 minutes between {CEQR_MARGIN_H} hours after sunrise and {CEQR_MARGIN_H} hours before sunset on the winter solstice, equinox or summer solstice: the window and representative days of the <a href={CEQR_URL} target="_blank" rel="noreferrer">NYC CEQR Technical Manual shadows chapter</a>. A lot counts as shaded at a sample when at least {Math.round(SHADE_COVERAGE * 100)}% of its area is inside the proposed buildings’ shadow. Flat ground; shadows existing buildings already cast are not subtracted, so this is the project’s shadow footprint rather than net sunlight lost.</p>
    </details>
  </section>
}
