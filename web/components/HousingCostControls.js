import limits from '../lib/hudIncomeLimits.json'

const dollars = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

/** One plan-wide switch. On: the current rent, utilities and income count as scenario assumptions and follow edits. */
export function CostSwitch({ included, rent, utilities, targetIncome, placedExcluded = 0, onChange, compact = false }) {
  const burden = targetIncome > 0 ? (rent + utilities) * 12 / targetIncome : null
  return <div className={`cost-switch${included ? ' on' : ''}${compact ? ' compact' : ''}`}>
    <label><input type="checkbox" role="switch" checked={included} onChange={event => onChange(event.target.checked)}/>
      <span><strong>Housing costs in score</strong>
        <small>{included
          ? `On · ${dollars(rent)} rent + ${dollars(utilities)} utilities vs ${dollars(targetIncome)} income${burden === null ? '' : ` (${(burden * 100).toFixed(0)}% of income)`}. Scenario assumptions; edits update the score.`
          : 'Off · housing-cost burden is excluded from every score until you turn this on.'}</small>
      </span>
    </label>
    {included && placedExcluded > 0 && <button onClick={() => onChange(true)}>Include {placedExcluded} placed building{placedExcluded === 1 ? '' : 's'} too</button>}
  </div>
}

/** HUD HOME income bands for the selected household size, one click each. */
export function AmiChips({ householdSize = 1, targetIncome, onIncome, onSize }) {
  const size = limits.householdSizes.includes(householdSize) ? householdSize : 1
  return <div className="ami-chips" role="group" aria-label={`Target household income, HUD ${limits.fiscalYear} HOME bands`}>
    <span>Household income · HUD {limits.fiscalYear} AMI for
      <button className="ami-size" aria-label={`Household size: ${size} ${size === 1 ? 'person' : 'people'}. Change`} onClick={() => onSize(size % limits.householdSizes.length + 1)}>{size} {size === 1 ? 'person' : 'people'}</button>
    </span>
    <div>{Object.entries(limits.incomeLimits).map(([band, values]) => {
      const income = values[size - 1]
      return <button key={band} aria-pressed={targetIncome === income} onClick={() => onIncome(income)} aria-label={`Use ${band}% AMI income: ${dollars(income)} a year`}><strong>{band}%</strong><small>{dollars(income)}</small></button>
    })}</div>
  </div>
}
