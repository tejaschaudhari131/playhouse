import { useRef } from 'react'
import { simulatedColor } from '../lib/buildingUses.js'

const KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/** A radio group: one tab stop, arrow keys move and select, Enter/Space select. */
export default function TypologyCards({ cards, onChoose, onScoreAll, pending }) {
  const refs = useRef([])
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
  const unscored = cards.some(card => card.status === 'unscored')
  return <div className="typology-cards">
    <div className="typology-heading"><span id="typology-label">Housing type</span>{unscored && <button className="assumptions-link" disabled={pending} onClick={onScoreAll}>Score all types</button>}</div>
    <div role="radiogroup" aria-labelledby="typology-label" onKeyDown={onKeyDown}>
      {cards.map((card, index) => <button key={card.typeId} ref={node => { refs.current[index] = node }} role="radio" aria-checked={card.active} tabIndex={card.active ? 0 : -1}
        className={`typology-card${card.active ? ' active' : ''}`} style={{ '--type-color': simulatedColor(card.typeId) }} onClick={() => choose(index)}
        aria-label={`${card.label}. ${card.units} ${card.units === 1 ? 'home' : 'homes'}, ${card.width} by ${card.depth} metres, ${card.floors} ${card.floors === 1 ? 'story' : 'stories'}. Zoning: ${card.permission.detail}. Score: ${pending && card.status !== 'unscored' ? 'updating' : card.statusText}.`}>
        <strong>{card.label}</strong>
        <span className="typology-meta">{card.units} {card.units === 1 ? 'home' : 'homes'} · {card.width} × {card.depth} m · {card.floors} st.</span>
        <span className="typology-status">
          <span className={`permission-chip ${card.permission.category}`}>{card.permission.label}</span>
          <span title={card.statusDetail || undefined} className={`typology-score ${card.status}`}>{pending && card.status !== 'unscored' ? '…' : card.statusText}</span>
        </span>
        {card.review && <small className="typology-review">{card.review}</small>}
      </button>)}
    </div>
    <small>Scores use the five preference factors. Use permission and whole-proposal checks are separate; neither is zoning approval.</small>
  </div>
}
