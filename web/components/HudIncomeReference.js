import limits from '../lib/hudIncomeLimits.json'
import Select from './Select.js'

const dollars = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

export default function HudIncomeReference({ householdSize = 1, targetIncome, monthly, onSize, onIncome }) {
  const size = limits.householdSizes.includes(householdSize) ? householdSize : 1
  return <details className="planner-details hud-income-reference">
    <summary>Compare household income bands · HUD {limits.fiscalYear}</summary>
    <p>Published HOME income references for the Pittsburgh area. Household size means people, not bedrooms or homes.</p>
    <label className="planner-field"><span>People in the household</span><Select aria-label="People in the household" value={String(size)} onChange={event => onSize(Number(event.target.value))}>{limits.householdSizes.map(value => <option key={value} value={value}>{value} {value === 1 ? 'person' : 'people'}</option>)}</Select></label>
    <div className="audit-table-wrap"><table className="audit-table"><caption>Annual income and a calculated monthly housing budget</caption><thead><tr><th scope="col">HOME band</th><th scope="col">Annual income</th><th scope="col">30% budget / month</th></tr></thead><tbody>{Object.entries(limits.incomeLimits).map(([band, values]) => <tr key={band}><th scope="row">{band}%</th><td><button aria-label={`Use ${band}% HOME income: ${values[size - 1]} dollars`} onClick={() => onIncome(values[size - 1])}>{dollars(values[size - 1])}</button></td><td>{dollars(values[size - 1] * .3 / 12)}</td></tr>)}</tbody></table></div>
    <p>Selected income: <strong>{dollars(targetIncome)}</strong>. A 30% housing budget is <strong>{dollars(targetIncome * .3 / 12)}/month</strong>, including utilities.{Number.isFinite(monthly) && <> Your entered rent + utilities: {dollars(monthly)}/month.</>}</p>
    <p>The 30% budget is a planning benchmark. These are not HOME or LIHTC rent ceilings, eligibility decisions, or evidence that a project can be financed. Selecting an income updates the target income; while Housing costs in score is on, it counts in scores immediately.</p>
    <small>HOME limits effective June 1, 2026. Published bands include adjustments; they are not simple percentages of local median household income.</small>
    <p><a href={limits.source.url} target="_blank" rel="noreferrer">HUD Pennsylvania HOME income table · page 2 ↗</a></p>
  </details>
}
