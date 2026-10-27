import { useState } from 'react'
import Select from './Select.js'
import { FloodSource } from './FloodEvidence.js'
import { BUILDINGS } from '../lib/buildings.js'
import { FLOOD_FILTER_OPTIONS, FLOOD_SCOPE } from '../lib/floodEvidence.js'
import { SITE_SORT_OPTIONS, sitePage, siteRecordSummary } from '../lib/studioSiteDiscovery.js'
import { recordCautions } from '../lib/siteCautions.js'

export default function StudioSites({ filters, setFilters, sites, onSelect, selectedPin, sources, loading = false, emptyAvailable = false }) {
  const filterKey = JSON.stringify(filters)
  const [pagination, setPagination] = useState({ key: filterKey, page: 0 })
  const page = sitePage(sites, pagination.key === filterKey ? pagination.page : 0)
  const set = (key, value) => setFilters({ ...filters, [key]: value })
  const changePage = value => setPagination({ key: filterKey, page: value })
  return <section className="studio-sites">
    <div className="section-heading"><h3>Find a site</h3><span>{loading ? 'Loading area…' : `${sites.length.toLocaleString()} matches`}</span></div>
    <p className="compact-help">Filter public records in this area. A record does not establish availability, occupancy or buildability.</p>
    <label className="planner-field"><span>Address or parcel ID</span><input value={filters.query || ''} onChange={event => set('query', event.target.value)} placeholder="Search this area…"/></label>
    <div className="site-filter-checks">
      {[['vacant', 'Recorded vacant'], ['cityOwned', 'Recorded City ownership'], ['taxDelinquent', 'Tax-delinquency flag']].map(([key, label]) => <label key={key}><input type="checkbox" checked={!!filters[key]} onChange={event => set(key, event.target.checked)}/>{label}</label>)}
      <label><input type="checkbox" checked={filters.excludeRestricted !== false} onChange={event => set('excludeRestricted', event.target.checked)}/>Hide right-of-way, institutional public land and HUD-assisted housing</label>
      {emptyAvailable && <label><input type="checkbox" checked={!!filters.emptyOnly} onChange={event => set('emptyOnly', event.target.checked)}/>Pre-screened empty-space fit in the current map view</label>}
    </div>
    <div className="field-grid">
      <label className="planner-field"><span>Minimum lot area (sq ft)</span><input type="number" min="0" step="any" value={filters.minLotSqft ?? ''} placeholder="Any size" onChange={event => set('minLotSqft', event.target.value === '' ? null : Number(event.target.value))}/></label>
      <label className="planner-field"><span>Maximum transit walk (min)</span><input type="number" min="0" step="any" value={filters.maxWalkMin ?? ''} placeholder="Any distance" onChange={event => set('maxWalkMin', event.target.value === '' ? null : Number(event.target.value))}/></label>
    </div>
    <p className="compact-help">Transit walk is a straight-line estimate to a stop with 60+ weekday departures, not a routed walk. Unknown values are excluded when these filters are set.</p>
    <label className="planner-field"><span>Flood screen</span><Select aria-label="Flood screen" value={filters.flood || 'any'} onChange={event => set('flood', event.target.value)}>{FLOOD_FILTER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><small>{FLOOD_SCOPE}</small></label>
    <p className="compact-help"><FloodSource sources={sources}/></p>
    <details className="planner-details">
      <summary>Zoning filter</summary>
      <label className="planner-field"><span>Housing use permitted by right</span><Select aria-label="Housing use permitted by right" value={filters.typeId || ''} onChange={event => set('typeId', event.target.value)}><option value="">Any use</option>{Object.entries(BUILDINGS).map(([id, building]) => <option key={id} value={id}>{building.label}</option>)}</Select><small>Includes types permitted for some unit counts. This is not a full zoning determination.</small></label>
    </details>
    <label className="planner-field"><span>Sort sites</span><Select aria-label="Sort sites" value={filters.sort || 'address'} onChange={event => set('sort', event.target.value)}>{SITE_SORT_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select><small>Unknown values appear last. Sorting does not rank development potential.</small></label>
    <p className="compact-help" role="status">{page.total ? `${page.start.toLocaleString()}–${page.end.toLocaleString()} of ${page.total.toLocaleString()} matches` : loading ? 'Waiting for area records…' : 'No parcels match these filters.'}</p>
    <ul className="studio-site-results">{page.items.map(feature => {
      const p = feature.properties, record = siteRecordSummary(p), cautions = recordCautions(p)
      return <li key={p.pin}><button aria-pressed={selectedPin === p.pin} onClick={() => onSelect(p.pin)}>
        <strong>{p.address || p.pin}</strong>
        <small>{record.lot} · {record.walk}</small>
        <small>{p.land_use || 'Recorded use unknown'} · {p.zoning_code || 'Zoning unknown'}</small>
        <small>{record.flood}</small>
        <small>{record.flags.join(' · ')}</small>
        {!!cautions.length && <span className="site-caution-tags">{cautions.map(c => <span key={c.id} className={c.hides ? 'caution' : ''} title={c.detail}>{c.label}</span>)}</span>}
      </button></li>
    })}</ul>
    {page.pages > 1 && <nav className="site-pagination" aria-label="Site result pages">
      <button disabled={page.page === 0} onClick={() => changePage(page.page - 1)}>Previous page</button>
      <span>Page {page.page + 1} of {page.pages}</span>
      <button disabled={page.page === page.pages - 1} onClick={() => changePage(page.page + 1)}>Next page</button>
    </nav>}
  </section>
}
