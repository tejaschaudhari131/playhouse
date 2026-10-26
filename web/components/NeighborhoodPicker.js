import Select from './Select.js'
export default function NeighborhoodPicker({ neighborhoods, value, onChange, disabled = false }) {
  return <label className="neighborhood-picker"><span>Neighborhood</span><Select aria-label="Neighborhood" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>{neighborhoods.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</Select></label>
}
