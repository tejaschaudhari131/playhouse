import { useId, useMemo } from 'react'
import { CITY_MILLAGE, HISTORIC_RATIOS, MILLAGE_SOURCE, RATIO_RANGE, SHIFT_CLASSES, UNCHANGED_LEVIES, parcelShift, shiftSummary, splitRates } from '../lib/lvtShift.js'
import { BUILDING_TYPE_BY_ID, parcelCategory } from '../lib/buildingTypes.js'
import { externalLinkLabel } from '../lib/links.js'

const money = value => `${value < 0 ? '−' : ''}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`
const signed = value => `${value > 0 ? '+' : ''}${money(value)}`
const percent = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value * 100))}%`
const millions = value => `$${(value / 1e6).toFixed(1)}M`

/** Ratio slider, citywide revenue-neutral rates, the selected parcel's City bill and a neighbourhood summary. */
export default function LvtShiftPanel({ value, onChange, base, parcel, parcels = [], neighborhood }) {
  const sliderId = useId(), enabled = !!value, ratio = value?.ratio ?? RATIO_RANGE.default
  const rates = useMemo(() => base?.parcels ? splitRates(base, ratio) : null, [base, ratio])
  const own = rates && parcel ? parcelShift(parcel, rates) : null
  const summary = useMemo(() => rates ? shiftSummary(parcels, rates, p => p.type_category || parcelCategory(p)) : null, [rates, parcels])
  if (!base?.parcels) return <p className="lvt-unavailable">Assessed land and building values are not available in this data build.</p>
  const revenue = (base.land + base.building) * CITY_MILLAGE / 1000
  const landShare = base.land / (base.land + base.building)
  return <div className="lvt-panel">
    <p className="lvt-label" role="note"><strong>Illustrative estimate.</strong> Not a tax bill, assessment or forecast. Uses 2026 County assessed values for City and school taxes, with no abatements, homestead or senior relief, appeals or behavioural change.</p>
    <div className="lvt-controls">
      <button type="button" className="lvt-toggle" aria-pressed={enabled} onClick={() => onChange(enabled ? null : { ratio })}>{enabled ? 'Showing tax shift on map' : 'Show tax shift on map'}</button>
      <label htmlFor={sliderId}>Land : building rate <strong>{ratio.toFixed(1)} : 1</strong></label>
      <input id={sliderId} type="range" min={RATIO_RANGE.min} max={RATIO_RANGE.max} step={RATIO_RANGE.step} value={ratio} list={`${sliderId}-ticks`} aria-valuetext={`${ratio} to 1`} onChange={event => onChange({ ratio: Number(event.target.value) })}/>
      <datalist id={`${sliderId}-ticks`}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}/>)}</datalist>
      <small>{HISTORIC_RATIOS.map(h => h.label).join(' · ')}.</small>
    </div>
    {rates && <dl className="lvt-rates">
      <div><dt>Today</dt><dd>{CITY_MILLAGE} mills on land and buildings</dd></div>
      <div><dt>Shift</dt><dd>{rates.landMills.toFixed(2)} mills on land · {rates.buildingMills.toFixed(2)} on buildings</dd></div>
      <div><dt>City revenue</dt><dd>{millions(revenue)} before and after, from {base.parcels.toLocaleString('en-US')} taxable parcels; land is {Math.round(landShare * 100)}% of their value</dd></div>
    </dl>}
    <section className="lvt-parcel" aria-label="Selected parcel">
      <h4>This parcel’s City bill</h4>
      {own ? <p><strong>{money(own.current)} → {money(own.proposed)}</strong> a year ({signed(own.change)}, {percent(own.percent)}). Land is {Math.round(own.landShare * 100)}% of its assessed value ({money(own.land)} land, {money(own.building)} building). Bills fall where that share is below the city’s {Math.round(landShare * 100)}%.</p>
        : <p>{parcel?.tax_status === 'exempt' ? 'Exempt from City real estate tax; no change.' : parcel?.tax_status === 'purta' ? 'Public utility realty (PURTA): taxed by the state, not shifted.' : 'No assessed land and building value recorded for this parcel.'}</p>}
    </section>
    {summary?.parcels > 0 && <section className="lvt-summary" aria-label="Neighbourhood summary">
      <h4>{neighborhood || 'Loaded parcels'}</h4>
      <p>{Math.round(summary.lowerShare * 100)}% of {summary.parcels.toLocaleString('en-US')} taxable parcels would pay less; median change {signed(summary.medianChange)} a year.</p>
      <table><thead><tr><th scope="col">Recorded use</th><th scope="col">Parcels</th><th scope="col">Median change</th></tr></thead>
        <tbody>{summary.byGroup.slice(0, 6).map(g => <tr key={g.key}><th scope="row">{BUILDING_TYPE_BY_ID[g.key]?.label || g.key}</th><td>{g.parcels.toLocaleString('en-US')}</td><td>{signed(g.medianChange)}</td></tr>)}</tbody>
      </table>
    </section>}
    <ul className="lvt-legend" aria-label="Map colours: change in City bill">{SHIFT_CLASSES.map(c => <li key={c.id}><i style={{ background: c.color }} aria-hidden="true"/>{c.label}</li>)}<li><i style={{ background: '#c9ccd1' }} aria-hidden="true"/>Exempt or no value</li></ul>
    <details className="lvt-method">
      <summary>Method and sources</summary>
      <p>Only the City levy shifts: <a href={MILLAGE_SOURCE.url} target="_blank" rel="noreferrer" aria-label={externalLinkLabel(MILLAGE_SOURCE.label)}>{MILLAGE_SOURCE.label}</a>. Pittsburgh taxed land at a higher City rate from 1913 to 2001: 2:1 after the phase-in (<a href="https://www.lincolninst.edu/app/uploads/legacy-files/pubfiles/assessing-theory-practice-land-value-taxation-full_0.pdf" target="_blank" rel="noreferrer">Dye &amp; England</a>) and more than 5:1 from 1979 (<a href="https://www.lincolninst.edu/app/uploads/legacy-files/pubfiles/banzhaf-wp08sb1.pdf" target="_blank" rel="noreferrer">Banzhaf &amp; Lavery</a>). These levies stay uniform: {UNCHANGED_LEVIES.map((l, i) => <span key={l.label}>{i ? ' and ' : ''}<a href={l.url} target="_blank" rel="noreferrer" aria-label={externalLinkLabel(l.label)}>{l.label}</a> at {l.mills} mills</span>)}.</p>
      <p>Revenue-neutral split rate: building rate = {CITY_MILLAGE} × (land + building) ÷ (ratio × land + building), summed over every taxable City parcel with recorded <code>LOCALLAND</code> and <code>LOCALBUILDING</code>; land rate = ratio × building rate. The method follows the Center for Land Economics’ open <a href="https://landeconomics.org/lvtshift" target="_blank" rel="noreferrer">LVTShift toolkit</a> (<a href="https://blog.landeconomics.org/p/want-to-model-a-land-value-tax-shift" target="_blank" rel="noreferrer">write-up</a>), simplified: no exemption reallocation, no levy reconciliation against the certified budget, no income or race progressivity join.</p>
    </details>
  </div>
}
