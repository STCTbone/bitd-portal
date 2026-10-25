import { useId } from 'react'
import { claimMaps, type ClaimDefinition } from '@/lib/crew/claimMaps'
import type { CrewClaim, CrewType } from '@/lib/crew/dossier'
import './CrewClaimMap.css'

export function CrewClaimMap({ type, definitions, claims, circle, base, canManage, onChange }: {
  type: CrewType; definitions: ClaimDefinition[]; claims: CrewClaim[]; circle: number
  base: string; canManage: boolean; onChange: (claims: CrewClaim[]) => void
}) {
  const id = useId().replaceAll(':', '')
  const map = claimMaps[type]
  const prefix = type.toLowerCase().replaceAll(' ', '-') + '-claim-'
  const definition = (ordinal: number) => definitions.find(claim => claim.id === prefix + ordinal)!
  const label = (ordinal: number) => {
    if (ordinal === 0) return 'Base'
    const claim = definition(ordinal)
    const siblings = definitions.filter(item => item.name === claim.name)
    return claim.name + (siblings.length > 1 ? ` (${siblings.findIndex(item => item.id === claim.id) + 1})` : '')
  }
  const held = (ordinal: number) => ordinal === 0 || claims.some(claim => claim.catalogId === prefix + ordinal)
  const point = (ordinal: number) => {
    const row = map.rows.findIndex(row => row.includes(ordinal))
    return [(map.rows[row].indexOf(ordinal) + .5) * 200, (row + .5) * 200]
  }
  const currentClaims = definitions.filter(claim => claims.some(selected => selected.catalogId === claim.id))

  return <div className="crew-claim-map" role="group" aria-label="Crew claims">
    <div className="claim-map-scroll" role="region" aria-label={`${type} claim map`} tabIndex={0}>
      <div className="claim-map-board">
        <svg className="claim-map-paths" viewBox="0 0 1000 800" preserveAspectRatio="none" aria-hidden="true">
          <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M 1 1 L 9 5 L 1 9 Z" fill="currentColor" /></marker></defs>
          {map.connections.map(([from, to]) => {
            const a = point(from), b = point(to)
            return <polyline key={`${from}-${to}`} data-from={from} data-to={to} className={held(from) && held(to) ? 'is-held' : ''} points={`${a} ${(a[0] + b[0]) / 2},${(a[1] + b[1]) / 2} ${b}`} markerMid={type === 'Dealers' ? `url(#${id}-arrow)` : undefined} />
          })}
        </svg>
        {map.rows.flatMap((row, rowIndex) => row.map((ordinal, column) => {
          const claim = ordinal ? definition(ordinal) : null
          const selected = claim ? claims.find(item => item.catalogId === claim.id) : null
          const locked = Boolean(claim?.circle && claim.circle > circle && !selected)
          const connections = map.connections.flatMap(([from, to]) => from === ordinal ? [label(to)] : to === ordinal && type !== 'Dealers' ? [label(from)] : [])
          return <div key={ordinal} className={`claim-map-slot${map.rowLabels ? ' has-row-label' : ''}`} data-claim={ordinal} data-row={rowIndex} data-column={column}>
            {column === 0 && map.rowLabels && <span className="claim-map-row-label">{map.rowLabels[rowIndex]}</span>}
            {claim ? <button type="button" className={`claim-node${selected ? ' is-held' : ''}${locked ? ' is-locked' : ''}${map.special.includes(ordinal) ? ' is-special' : ''}`} aria-label={label(ordinal)} aria-pressed={Boolean(selected)} aria-describedby={`${id}-effect-${ordinal} ${id}-links-${ordinal}`} disabled={!canManage || locked} onClick={() => onChange(selected ? claims.filter(item => item.catalogId !== claim.id) : [...claims, { catalogId: claim.id, notes: '' }])}>
              <span className="claim-node-name">{label(ordinal)}</span>
              <span className="claim-node-effect" id={`${id}-effect-${ordinal}`}>{map.effects[ordinal]}</span>
              <span className="claim-node-state">{selected ? '✓ Held' : locked ? `Circle ${claim.circle}` : 'Unclaimed'}</span>
            </button> : <div className="claim-node claim-base"><span className="claim-node-name">Base</span><span className="claim-node-effect">{base || 'Crew base'}</span></div>}
            <span className="sr-only" id={`${id}-links-${ordinal}`}>{type === 'Dealers' ? 'Leads to' : 'Connected to'}: {connections.join(', ') || 'No further claims'}.</span>
          </div>
        }))}
      </div>
    </div>
    {currentClaims.length > 0 && <details className="claim-map-notes"><summary>Claim notes ({currentClaims.length})</summary><div className="crew-fields">{currentClaims.map(claim => <label key={claim.id}>Claim notes {label(Number(claim.id.slice(prefix.length)))}<input aria-label={`Claim notes ${label(Number(claim.id.slice(prefix.length)))}`} maxLength={5000} value={claims.find(item => item.catalogId === claim.id)!.notes} onChange={event => onChange(claims.map(item => item.catalogId === claim.id ? { ...item, notes: event.target.value } : item))} /></label>)}</div></details>}
  </div>
}
