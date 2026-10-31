import { SLOPE_CLASSES, formatElevation } from '../lib/terrain.js'

const pct = share => `${Math.round(share * 100)}%`

/** Parcel elevation and slope from the DEM, beside the City's 25%+ steep-slope layer overlap. */
export default function ParcelTerrain({ stats, status, cityOverlap }) {
  const band = SLOPE_CLASSES.find(c => c.id === stats?.class)
  const city = Number.isFinite(cityOverlap) ? cityOverlap : null
  const caution = stats && (stats.verySteepShare >= .1 || city > 0)
  return <section className="parcel-terrain" aria-label="Elevation and slope">
    <h4>Elevation and slope</h4>
    {stats ? <dl>
      <div><dt>Elevation</dt><dd>{formatElevation(stats.elevation)}{stats.maxElevation - stats.minElevation >= 1 ? ` · ${Math.round(stats.maxElevation - stats.minElevation)} m rise across the lot` : ''}</dd></div>
      <div><dt>Typical slope</dt><dd><i style={{ background: band?.color }} aria-hidden="true"/>{Math.round(stats.typical)}% · {band?.short} <small>(steepest sample {Math.round(stats.max)}%)</small></dd></div>
      <div><dt>Steep ground</dt><dd>{pct(stats.steepShare)} of the lot at 15%+ · {pct(stats.verySteepShare)} at 25%+</dd></div>
      {city !== null && <div><dt>City 25%+ layer</dt><dd>{pct(city)} of the lot</dd></div>}
    </dl> : <p>{status === 'loading' ? 'Measuring elevation…' : 'Elevation unavailable: terrain tiles did not load. Other site facts are unaffected.'}</p>}
    {caution && <p className="parcel-terrain-caution" role="note">Steep ground: slopes of 25%+ are the City’s landslide-risk proxy. Plan for a geotechnical review, §915.02 grading limits and possible retaining walls before relying on these scores.</p>}
    <small>From a ~3 m USGS 3DEP elevation model (Horn slope, 4 m window, about 24 points in the lot). A screen, not a survey.</small>
  </section>
}
