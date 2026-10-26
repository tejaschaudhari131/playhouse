import { CITY_STATUS_LABELS } from '../lib/sites.js'

const flag = value => value === true ? 'Recorded' : value === false ? 'No flag in this source' : 'Unknown'

export default function PolicyContext({ properties, snapshot }) {
  return <details className="planner-details policy-context">
    <summary>Ownership, acquisition & housing support</summary>
    <dl className="site-records">
      <div><dt>City inventory</dt><dd>{flag(properties.city_owned)}{properties.city_owned && <small>{properties.city_inventory || 'Inventory category unknown'} · {CITY_STATUS_LABELS[properties.city_status] || 'Status unknown'}</small>}</dd></div>
      <div><dt>Tax delinquency</dt><dd>{flag(properties.tax_delinquent)}</dd></div>
      <div><dt>Recorded vacancy</dt><dd>{flag(properties.vacant_lot)}</dd></div>
    </dl>
    <p>Public-record snapshot: {snapshot || 'date unavailable'}. These records do not establish current availability, ownership clearance or occupancy. Land purchase price, liens, acquisition feasibility and tenant-level impacts are unassessed.</p>
    <ul>
      <li><a href="https://pghlandbank.org/how-to-buy-vacant-blighted-or-tax-delinquent-property-in-pittsburgh/" target="_blank" rel="noreferrer">Land Bank: ownership & acquisition routes ↗</a></li>
      <li><a href="https://www.ura.org/pages/property-disposition" target="_blank" rel="noreferrer">URA property purchase process ↗</a></li>
      <li><a href="https://www.ura.org/pages/housing" target="_blank" rel="noreferrer">Tenant, homeowner & housing-development support ↗</a></li>
      <li><a href="https://engage.pittsburghpa.gov/implementing-housing-needs-assessment" target="_blank" rel="noreferrer">City housing policy updates ↗</a></li>
    </ul>
    <p>Program eligibility and funding are not evaluated. Proposed zoning reforms do not change this model until adopted rules and supporting data are reviewed.</p>
  </details>
}
