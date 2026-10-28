import { useEffect, useId, useRef, useState } from 'react'
import { commitNumber } from '../lib/numberInput.js'

/** Commit on blur/Enter. Invalid edits remain visible and never reach the scenario. */
export default function NumberInput({ label, value, onChange, min = 0, max = 100000, step = 1, hint, nullable = false, integer = false, rejectRange = false, disabled = false }) {
  const [draft, setDraft] = useState(value ?? ''), [feedback, setFeedback] = useState(null)
  const dirty = useRef(false), id = useId()
  useEffect(() => { setDraft(value ?? ''); dirty.current = false }, [value])
  function commit() {
    if (!dirty.current) return
    dirty.current = false
    const result = commitNumber(draft, { min, max, integer, nullable, rejectRange, label })
    setFeedback(result.message ? result : null)
    if (result.valid) { setDraft(result.value ?? ''); onChange(result.value) }
  }
  return <label className="planner-field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={draft} disabled={disabled} aria-invalid={feedback?.valid === false || undefined} aria-describedby={[hint && `${id}-hint`, feedback && `${id}-feedback`].filter(Boolean).join(' ') || undefined}
    onChange={event => { dirty.current = true; setDraft(event.target.value); setFeedback(null) }} onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape' && dirty.current) { event.preventDefault(); dirty.current = false; setDraft(value ?? ''); setFeedback(null) } }} placeholder={nullable ? 'Unknown' : undefined}/>
    {hint && <small id={`${id}-hint`}>{hint}</small>}{feedback && <small className="input-feedback" id={`${id}-feedback`} role="status">{feedback.message}</small>}
  </label>
}
