const TERMS = [
  ['LNC', 'Local Neighborhood Commercial: a mapped zoning district. Permission for a use does not mean every part of a design passes zoning.'],
  ['Screen', 'A preliminary check using available data, not an approval.'],
  ['Proxy', 'An indirect measure. For example, sales activity describes market conditions but does not measure demand for a particular proposed home.'],
  ['Schematic', 'A simplified design assumption, not a detailed engineering model.'],
  ['Diagnostic / underlying score', 'The preference calculation before feasibility and zoning checks. It cannot rank an ineligible proposal.'],
  ['No clear winner / close call', 'The leading scores are within the stated comparison band, or priorities change the result. The band is a team choice, not a statistical confidence interval.'],
  ['AMI', 'Area median income. HUD household-size income limits are used as target scenarios, not the incomes of actual residents.'],
  ['Not assessed', 'The evidence needed for this check is missing. It does not mean the proposal passes.'],
]

/** Small, keyboard-accessible disclosure reused where planning shorthand appears. */
export default function Glossary({ label = 'Planning terms' }) {
  return <details className="planner-glossary"><summary>{label}</summary><dl>{TERMS.map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl></details>
}
