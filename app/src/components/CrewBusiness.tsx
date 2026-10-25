import type { CrewData, DealerBusiness } from '@/lib/crew/dossier'

const businessText = [
  ['product', 'Product'], ['supply', 'Supply notes'], ['demand', 'Demand notes'],
  ['distribution', 'Distribution and sales territory'], ['competitiveAdvantages', 'Competitive advantage notes'],
] as const
const source = 'https://evilhat.com/wp-content/uploads/2026/07/Crew-Sheets-and-Playbooks.zip'

/** Distinct records survive type corrections; only the active type is editable. */
export function CrewBusiness({ values, change }: {
  values: CrewData
  change: <K extends keyof CrewData>(field: K, value: CrewData[K]) => void
}) {
  const business = values.dealerBusiness, cause = values.militantCause
  const hasBusiness = business.units > 0 || businessText.some(([field]) => business[field].length > 0)
  const hasCause = cause.cause.length > 0 || cause.enemies.some(enemy => enemy.length > 0)
  function editBusiness<K extends keyof DealerBusiness>(field: K, value: DealerBusiness[K]) {
    change('dealerBusiness', { ...business, [field]: value })
  }
  return <div className="crew-business">
    {values.type === 'Dealers' && <section aria-label="Dealers business">
      <h3>Dealers business</h3>
      <details className="rules-reference"><summary>Rules reference</summary><p>Dealers begin with one Turf instead of hunting grounds; record its district in Distribution and sales territory.</p></details>
      <div className="crew-fields">
        <label>Product<textarea aria-label="Product" maxLength={5000} rows={2} value={business.product} onChange={event => editBusiness('product', event.target.value)} /></label>
        <label>Product units<input aria-label="Product units" type="number" min={0} max={9999} step={1} required value={business.units} onChange={event => editBusiness('units', event.target.valueAsNumber)} /></label>
        {businessText.filter(([field]) => field !== 'product').map(([field, label]) => <label key={field}>{label}<textarea aria-label={label} maxLength={5000} rows={3} value={business[field]} onChange={event => editBusiness(field, event.target.value)} /></label>)}
      </div>
      <details className="rules-reference"><summary>Rules reference</summary><p className="crew-guidance">Supply, demand, competitive advantages and distribution progress left to right on the published tracks. The second Demand claim needs the second Supply or second Competitive Advantage claim. Losing a link makes dependent claims unavailable until restored.</p></details>
      <details className="rules-reference"><summary>Sources</summary><small>Sources: Blades ’68 v1.0.1, pp. 98–105; <a href={source} target="_blank" rel="noreferrer">official crew sheets v6, p. 1</a>.</small></details>
    </section>}
    {values.type === 'Militants' && <section aria-label="Militants cause">
      <h3>Militants cause</h3>
      <details className="rules-reference"><summary>Rules reference</summary><p className="crew-guidance">Define the cause and choose two Enemies of the Cause instead of hunting grounds. Preferred operations: Assassination, Demonstration, Sabotage or Battle.</p></details>
      <div className="crew-fields">
        <label>Cause<textarea aria-label="Cause" maxLength={5000} rows={3} value={cause.cause} onChange={event => change('militantCause', { ...cause, cause: event.target.value })} /></label>
        {cause.enemies.map((enemy, index) => <label key={index}>Enemy of the Cause {index + 1}<textarea aria-label={`Enemy of the Cause ${index + 1}`} maxLength={5000} rows={3} value={enemy} onChange={event => {
          const enemies: [string, string] = [...cause.enemies]
          enemies[index] = event.target.value
          change('militantCause', { ...cause, enemies })
        }} /></label>)}
      </div>
      <details className="rules-reference"><summary>Sources</summary><small>Sources: Blades ’68 v1.0.1, pp. 116–118; <a href={source} target="_blank" rel="noreferrer">official crew sheets v6, p. 3</a>.</small></details>
    </section>}
    {values.type !== 'Dealers' && hasBusiness && <details className="crew-retained">
      <summary>Retained Dealers business (inactive)</summary>
      <p>This Dealers record is preserved. Select Dealers to edit it.</p>
      <dl>{businessText.map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{business[field] || 'Not recorded'}</dd></div>)}<div><dt>Product units</dt><dd>{business.units}</dd></div></dl>
    </details>}
    {values.type !== 'Militants' && hasCause && <details className="crew-retained">
      <summary>Retained Militants cause (inactive)</summary>
      <p>This Militants record is preserved. Select Militants to edit it.</p>
      <dl><div><dt>Cause</dt><dd>{cause.cause || 'Not recorded'}</dd></div>{cause.enemies.map((enemy, index) => <div key={index}><dt>Enemy of the Cause {index + 1}</dt><dd>{enemy || 'Not recorded'}</dd></div>)}</dl>
    </details>}
  </div>
}
