import { useState } from 'react'
import NumberInput from './NumberInput.js'
import { financeInputs, FINANCE_LIMITS, constructionRates } from '../lib/financeInputs.js'

/** Optional financial inputs stay in Advanced and travel with the saved/exported plan. */
export default function FinanceControls({ value = {}, option, onChange }) {
  const input = financeInputs(value), [error, setError] = useState('')
  const rates = input.constructionByType?.[option.typeId] || constructionRates(option)
  const field = (key, label, hint, percent = true) => <NumberInput key={key} label={label} hint={hint} value={Math.round(input[key] * (percent ? 100 : 1) * 1000) / 1000} min={FINANCE_LIMITS[key][0] * (percent ? 100 : 1)} max={FINANCE_LIMITS[key][1] * (percent ? 100 : 1)} step={percent ? .5 : 1} integer={key === 'constructionMonths'} rejectRange onChange={v => onChange({ ...value, [key]: v / (percent ? 100 : 1) })}/>
  function rate(index, amount) {
    const next = [...rates]; next[index] = amount
    if (next[0] > next[1]) { setError('Low construction cost must not exceed the high cost. Range unchanged.'); return }
    setError(''); onChange({ ...value, constructionByType: { ...value.constructionByType, [option.typeId]: next } })
  }
  return <details className="planner-details" id="finance-assumptions">
    <summary>Development costs & valuation <span>Editable assumptions</span></summary>
    <p>These inputs affect the pro forma, not housing preference scores. Construction overrides follow the selected housing type; other assumptions apply across this plan.</p>
    <div className="field-grid two">{[0, 1].map(index => <NumberInput key={index} label={`${index ? 'High' : 'Low'} construction ($/sq ft)`} value={rates[index]} min={50} max={2000} rejectRange onChange={v => rate(index, v)}/>)}</div>
    {error && <p role="status" className="input-feedback">{error}</p>}
    <div className="field-grid two">
      {field('siteWorkShare', 'Site work (% of construction)', 'Separate allowance; unusual utilities, slopes and remediation need a quote.')}
      {field('softShare', 'Design, permits & legal (%)', 'Of hard costs. Excludes the fee, contingency, financing and reserves below.')}
      {field('contingencyShare', 'Contingency (% of hard)')}
      {field('developerFeeShare', 'Developer fee (%)', 'Of hard + design/permits/legal + contingency.')}
      {field('interestRate', 'Construction interest (%/year)')}
      {field('financedShare', 'Construction loan share (%)', 'Of cost before interest; a scenario, not an offered loan.')}
      {field('constructionMonths', 'Construction term (months)', null, false)}
      {field('averageDraw', 'Average loan draw (%)', '50% approximates a linear construction draw schedule.')}
      {field('reservePerHome', 'Initial reserve ($/home)', 'Working-capital/lease-up allowance; no assumption that it is LIHTC eligible.', false)}
      {field('vacancyShare', 'Vacancy & collection loss (%)')}
      {field('operatingShare', 'Operating expenses (%)', 'Of rent after vacancy; includes taxes, insurance, management and maintenance. Debt service excluded.')}
      {field('capRate', 'Capitalization rate (%)', 'NOI ÷ cap rate. Metro evidence is not a parcel appraisal.')}
    </div>
    <button onClick={() => { onChange({}); setError('') }}>Reset financial assumptions</button>
    <details><summary>Sources & scope</summary><p><a href="https://www.irr.com/research/32403/2026-mid-year-viewpoint-pittsburgh-pa-multifamily-report" target="_blank" rel="noreferrer">IRR Pittsburgh, August 2026</a>: metro cap rates 6–8%, vacancy 5–6%. The selected 7.25% cap and 5.5% vacancy are assumptions. <a href="https://terrapincg.com/news/multi-family-wood-frame-construction-cost-per-unit-2026" target="_blank" rel="noreferrer">Terrapin 2026 contractor guide</a> anchors national apartment cost bands; story-based mapping to these prototypes is an assumption, not a verified structural design or Pittsburgh bid. Single-family $225–325/sq ft and other allowances are team assumptions. All costs use gross modeled floor area, not a measured one-bedroom unit.</p></details>
  </details>
}
