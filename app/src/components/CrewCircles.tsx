import type { CrewData, RacerCircuit, RacerVehicle, UtopianVision } from '@/lib/crew/dossier'
const operations = ['Smuggling', 'Hijacking', 'Racing', 'Smash-and-Grab']
const stunts = ['Smuggler’s Turn', 'Reverse 180', 'Shell Game', 'Outside Ride', 'Big Air', 'Ramming Speed']
const edges = ['Nimble', 'Simple', 'Sturdy'], flaws = ['Distinct', 'Finicky', 'Guzzler']
const circleNames = ['First Circle', 'Second Circle', 'Third Circle', 'Final Circle']
const truthLabels = ['First Circle truth 1', 'First Circle truth 2', 'Second Circle truth', 'Third Circle truth', 'Final Circle truth']
const truthExamples = ['Free, Egalitarian, Abundant, Beautiful, Serene, Radiant, Natural', 'Free, Egalitarian, Abundant, Beautiful, Serene, Radiant, Natural', 'Shifting, Sweltering, Lustful, Unsettling, Future, Past, Alien', 'Psychedelic, Inhuman, Violent, Future, Past, Tempestuous', 'Fiery, Frozen, Terrifying, Cruel, Monstrous, Capricious, Inhuman']
const toggle = (current: string[], value: string, checked: boolean) => checked ? [...current, value] : current.filter(item => item !== value)
const source = 'https://evilhat.com/wp-content/uploads/2026/07/Crew-Sheets-and-Playbooks.zip'
export function CrewCircles({ values, change, canManage }: {
  values: CrewData; change: <K extends keyof CrewData>(field: K, value: CrewData[K]) => void; canManage: boolean
}) {
  const circuit = values.racerCircuit, vision = values.utopianVision
  const editCircuit = (patch: Partial<RacerCircuit>) => change('racerCircuit', { ...circuit, ...patch })
  const editVision = (patch: Partial<UtopianVision>) => change('utopianVision', { ...vision, ...patch })
  const editVehicle = (index: number, patch: Partial<RacerVehicle>) => editCircuit({ vehicles: circuit.vehicles.map((vehicle, i) => i === index ? { ...vehicle, ...patch } : vehicle) })
  return <div className="crew-business">
    {values.type === 'Racers' && <section aria-label="Racers circuit">
      <h3>Racers circuit & vehicles</h3>
      <details className="rules-reference"><summary>Rules reference</summary><p className="crew-guidance">Choose a preferred operation for your local circuit instead of hunting grounds. Turf can expand the circuit and add operations after GM review. Racers start with Stunt Riders and one other ability, choosing one signature stunt. Each additional Stunt Riders advance adds a stunt; record those advances in Crew abilities.</p></details>
      <label>Local circuit<textarea aria-label="Local circuit" rows={3} maxLength={5000} value={circuit.circuit} onChange={e => editCircuit({ circuit: e.target.value })} /></label>
      <h4>Circuit operations</h4><div className="crew-claims">{operations.map(value => <label className="crew-checkbox" key={value}><input aria-label={'Circuit operation: ' + value} type="checkbox" checked={circuit.operations.includes(value)} onChange={e => editCircuit({ operations: toggle(circuit.operations, value, e.target.checked) })} />{value}</label>)}</div>
      <h4>Signature stunts</h4><div className="crew-claims">{stunts.map(value => <label className="crew-checkbox" key={value}><input aria-label={'Signature stunt: ' + value} type="checkbox" checked={circuit.signatureStunts.includes(value)} onChange={e => editCircuit({ signatureStunts: toggle(circuit.signatureStunts, value, e.target.checked) })} />{value}</label>)}</div>
      <h4>Vehicle traits</h4><details className="rules-reference"><summary>Rules reference</summary><p>Custom Ride uses one or two edges and an equal number of flaws.</p>
<p className="crew-guidance">Nimble assists tricky maneuvers; Simple eases repairs; Sturdy keeps operating when broken. Distinct draws attention; Finicky depends on its operator; Guzzler costs upkeep.</p></details>
      {circuit.vehicles.map((vehicle, index) => <fieldset className="crew-cohort" key={vehicle.id}><legend>Vehicle {index + 1}</legend>
        <label>Vehicle name {index + 1}<input aria-label={'Vehicle name ' + (index + 1)} maxLength={100} required value={vehicle.name} onChange={e => editVehicle(index, { name: e.target.value })} /></label>
        <div className="crew-claims">{edges.map(value => <label className="crew-checkbox" key={value}><input aria-label={`Vehicle ${index + 1} edge: ${value}`} type="checkbox" checked={vehicle.edges.includes(value)} onChange={e => editVehicle(index, { edges: toggle(vehicle.edges, value, e.target.checked) })} />{value}</label>)}</div>
        <div className="crew-claims">{flaws.map(value => <label className="crew-checkbox" key={value}><input aria-label={`Vehicle ${index + 1} flaw: ${value}`} type="checkbox" checked={vehicle.flaws.includes(value)} onChange={e => editVehicle(index, { flaws: toggle(vehicle.flaws, value, e.target.checked) })} />{value}</label>)}</div>
        <label>Vehicle notes {index + 1}<textarea aria-label={'Vehicle notes ' + (index + 1)} rows={2} maxLength={5000} value={vehicle.notes} onChange={e => editVehicle(index, { notes: e.target.value })} /></label>
        {canManage && <button type="button" className="crew-secondary" onClick={() => editCircuit({ vehicles: circuit.vehicles.filter((_, i) => i !== index) })}>Remove racer vehicle {index + 1}</button>}
      </fieldset>)}
      {canManage && <button type="button" onClick={() => editCircuit({ vehicles: [...circuit.vehicles, { id: crypto.randomUUID(), name: 'New vehicle', edges: [], flaws: [], notes: '' }] })}>Add racer vehicle</button>}
      <details className="rules-reference"><summary>Sources</summary><p><small>Sources: Blades ’68 v1.0.1, pp. 124–131; <a href={source} target="_blank" rel="noreferrer">official crew sheets v6, p. 4</a>.</small></p></details>
    </section>}
    {values.type === 'Utopians' && <section aria-label="Utopian campaign record">
      <h3>Utopian vision & Circles</h3>
      <label>Utopian vision<textarea aria-label="Utopian vision" rows={3} maxLength={5000} value={vision.vision} onChange={e => editVision({ vision: e.target.value })} /></label>
      <details className="rules-reference"><summary>Rules reference</summary><p className="crew-guidance">Gold: 20 stacks earned, separate from the wallet. Blood: Second Circle and 10 lives ended. Power: Third Circle, Tier 3 and a created major anomaly.</p></details>
      <div className="crew-fields">
        <label>Reviewed Utopian Circle<select aria-label="Reviewed Utopian Circle" value={vision.circle} onChange={e => editVision({ circle: Number(e.target.value) })}>{circleNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select><small>Clear ineligible abilities and claims when correcting to an earlier Circle.</small></label>
        <label>Stacks earned since campaign start<input aria-label="Stacks earned since campaign start" type="number" min={0} max={9999} step={1} required value={vision.stacksEarned} onChange={e => editVision({ stacksEarned: e.target.valueAsNumber })} /></label>
        <label>Lives ended since campaign start<input aria-label="Lives ended since campaign start" type="number" min={0} max={9999} step={1} required value={vision.livesEnded} onChange={e => editVision({ livesEnded: e.target.valueAsNumber })} /></label>
      </div>
      <label className="crew-checkbox"><input aria-label="Major anomaly created" type="checkbox" checked={vision.majorAnomalyCreated} onChange={e => editVision({ majorAnomalyCreated: e.target.checked })} />Major anomaly created</label>
      <h4>Truths of the vision</h4><details className="rules-reference"><summary>Rules reference</summary><p>Two truths in the First Circle, then one new truth in each later Circle. Examples are suggestions; write your table’s truths.</p></details>
      <div className="crew-fields">{truthLabels.map((label, index) => <label key={label}>{label}<input aria-label={label} maxLength={5000} value={vision.truths[index]} onChange={e => {
        const truths: UtopianVision['truths'] = [...vision.truths]; truths[index] = e.target.value; editVision({ truths })
      }} /><small>{truthExamples[index]}</small></label>)}</div>
      <label>Anomalies<textarea aria-label="Anomalies" rows={4} maxLength={5000} value={vision.anomalies} onChange={e => editVision({ anomalies: e.target.value })} /></label>
      <details className="rules-reference"><summary>Rules reference</summary><p><small>Sources: Blades ’68 v1.0.1, pp. 140–149; <a href={source} target="_blank" rel="noreferrer">official crew sheets v6, p. 6</a>. Remember the Forgotten requires the Final Circle. Other crews can borrow only First Circle abilities.</small></p></details>
    </section>}
    {values.type !== 'Racers' && (circuit.circuit || circuit.operations.length > 0 || circuit.signatureStunts.length > 0 || circuit.vehicles.length > 0) && <details className="crew-retained"><summary>Retained Racers circuit (inactive)</summary><p>Select Racers to edit this preserved record.</p><dl><div><dt>Local circuit</dt><dd>{circuit.circuit || 'Not recorded'}</dd></div><div><dt>Operations</dt><dd>{circuit.operations.join(', ') || 'Not recorded'}</dd></div><div><dt>Signature stunts</dt><dd>{circuit.signatureStunts.join(', ') || 'Not recorded'}</dd></div>{circuit.vehicles.map(vehicle => <div key={vehicle.id}><dt>{vehicle.name}</dt><dd>Edges: {vehicle.edges.join(', ') || 'None recorded'}. Flaws: {vehicle.flaws.join(', ') || 'None recorded'}. {vehicle.notes}</dd></div>)}</dl></details>}
    {values.type !== 'Utopians' && (vision.vision || vision.circle > 1 || vision.stacksEarned > 0 || vision.livesEnded > 0 || vision.majorAnomalyCreated || vision.anomalies || vision.truths.some(Boolean)) && <details className="crew-retained"><summary>Retained Utopian vision (inactive)</summary><p>Select Utopians to edit this preserved record.</p><dl><div><dt>Vision</dt><dd>{vision.vision || 'Not recorded'}</dd></div><div><dt>Reviewed Circle</dt><dd>{circleNames[vision.circle - 1]}</dd></div><div><dt>Campaign totals</dt><dd>{vision.stacksEarned} stacks earned; {vision.livesEnded} lives ended; major anomaly created: {vision.majorAnomalyCreated ? 'yes' : 'no'}.</dd></div>{truthLabels.map((label, index) => <div key={label}><dt>{label}</dt><dd>{vision.truths[index] || 'Not recorded'}</dd></div>)}<div><dt>Anomalies</dt><dd>{vision.anomalies || 'Not recorded'}</dd></div></dl></details>}
  </div>
}
