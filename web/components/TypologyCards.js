import { useId, useRef, useState } from 'react'
import { simulatedColor } from '../lib/buildingUses.js'

const KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/** A radio group: one tab stop, arrow keys move and select, Enter/Space select. */
export default function TypologyCards({ cards, onChoose, onScoreAll, pending }) {
  const refs = useRef([]), infoId = useId()
  const [showInfo, setShowInfo] = useState(false)
  const activeIndex = Math.max(0, cards.findIndex(card => card.active))
  function choose(index) {
    const next = (index + cards.length) % cards.length
    onChoose(cards[next].typeId)
    refs.current[next]?.focus()
  }
  function onKeyDown(event) {
    if (event.key in KEYS) { event.preventDefault(); choose(activeIndex + KEYS[event.key]) }
    else if (event.key === 'Home') { event.preventDefault(); choose(0) }
    else if (event.key === 'End') { event.preventDefault(); choose(cards.length - 1) }
  }
  const selected = cards[activeIndex]
  const unscored = cards.some(card => card.status === 'unscored')
  return <div className="typology-cards">
    <div className="typology-heading"><span id="typology-label">Housing type</span><span className="typology-heading-actions">{unscored && <button className="assumptions-link" disabled={pending} onClick={onScoreAll}>Score all types</button>}<button type="button" className="typology-info-toggle" aria-label="About housing scores and checks" aria-expanded={showInfo} aria-controls={infoId} onClick={() => setShowInfo(value => !value)} onKeyDown={event => { if (event.key === 'Escape' && showInfo) { event.preventDefault(); event.stopPropagation(); setShowInfo(false) } }}><span aria-hidden="true">i</span></button></span></div>
    <p id={infoId} className="typology-info" hidden={!showInfo}>Scores compare five preference factors under your priorities. Physical fit and transit capacity are separate checks. “Use permitted” covers the proposed use only. Unassessed zoning checks still need review; a score is not approval. With a placed plan, scores and check counts cover the plan plus this next building.</p>
    <div role="radiogroup" aria-labelledby="typology-label" onKeyDown={onKeyDown}>
      {cards.map((card, index) => <button key={card.typeId} ref={node => { refs.current[index] = node }} role="radio" aria-checked={card.active} tabIndex={card.active ? 0 : -1}
        className={`typology-card${card.active ? ' active' : ''}`} style={{ '--type-color': simulatedColor(card.typeId) }} onClick={() => choose(index)}
        aria-label={`${card.label}. ${card.units} ${card.units === 1 ? 'home' : 'homes'}, ${card.width} by ${card.depth} metres, ${card.floors} ${card.floors === 1 ? 'story' : 'stories'}. ${pending && card.status !== 'unscored' ? 'Updating checks and score.' : `${card.statusText}. ${card.compactStatus}. ${card.review}`}`}>
        <strong>{card.shortLabel}</strong>
        <span className="typology-meta">{card.units} {card.units === 1 ? 'home' : 'homes'} · {card.width} × {card.depth} m · {card.floors} st.</span>
        <span className={`typology-score ${card.status}`}>
          {pending && card.status !== 'unscored' ? 'Updating…' : <>{card.status === 'review' ? 'Not ranked' : card.statusText} · {card.compactStatus}</>}
        </span>
        <small title={pending ? undefined : card.review} className={`typology-review${card.notAssessed === 0 ? ' assessed' : ''}`}>{pending && card.status !== 'unscored' ? 'Checking…' : <>{card.notAssessed !== 0 && <span aria-hidden="true">⚠ </span>}{card.reviewText}{card.planScope ? ' · plan' : ''}</>}</small>
      </button>)}
    </div>
    {selected && <details key={selected.typeId} className="typology-details">
      <summary>{selected.shortLabel} · Details</summary>
      {pending ? <p>Updating checks and score…</p> : <>
        {selected.details.length ? <ul>{selected.details.map((detail, index) => <li key={index}>{detail.text}{detail.url && <> <a href={detail.url} target="_blank" rel="noreferrer">{detail.section ? `§${detail.section}` : 'Source'} ↗</a></>}</li>)}</ul> : <p>{selected.statusDetail || 'Choose this type or score all types to evaluate it.'}</p>}
        <p>{selected.permission.detail}</p><p>{selected.review}</p>
      </>}
    </details>}
  </div>
}
