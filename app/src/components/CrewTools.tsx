import catalog from '@/lib/crew/catalog.json'
import type { CrewData, CrewCohort } from '@/lib/crew/dossier'

type AbilityDefinition = { id:string; name:string; choices:string[]; repeatable:boolean; circle?:number }
type Definition = { abilities:AbilityDefinition[]; upgrades:{id:string;name:string;max:number}[]; claims:{id:string;name:string;circle?:number}[] }
const catalogs: Record<string, Definition> = catalog
export function CrewTools({ values, change, canManage }: {
  values:CrewData; change:<K extends keyof CrewData>(field:K,value:CrewData[K])=>void; canManage:boolean
}) {
  const choices = catalogs[values.type]
  const abilities = values.abilities ?? [], upgrades = values.upgrades ?? [], claims = values.claims ?? [], cohorts = values.cohorts ?? []
  const editCohort = (index:number, patch:Partial<CrewCohort>) => change('cohorts',cohorts.map((row,i)=>i===index?{...row,...patch}:row))
  const text = (label:string,value:string,set:(value:string)=>void,max=5000) => <label key={label}>{label}<input aria-label={label} value={value} maxLength={max} onChange={e=>set(e.target.value)} /></label>
  return <div className="crew-tools">
    <h3>Abilities, upgrades & claims</h3>
    <p className="crew-guidance">Selections are manual records. Review costs, choices and effects with the GM; saving never changes character Keys, load, XP, Heat or resources. Clear incompatible selections before changing crew type. Utopian abilities and claims require the reviewed Circle recorded above.</p>
    <h4>Crew abilities</h4>
    {abilities.map((row,index)=>{
      const definition = choices.abilities.find(item=>item.id===row.catalogId)
      return <div className="crew-tool-row" key={row.id}>
        <label>Ability {index+1}<select aria-label={'Ability '+(index+1)} value={row.catalogId} onChange={e=>change('abilities',abilities.map((item,i)=>i===index?{...item,catalogId:e.target.value,choice:''}:item))}>
          {!definition && <option value={row.catalogId}>Previous crew selection — remove or replace</option>}
          {choices.abilities.map(item=><option key={item.id} value={item.id} disabled={!!item.circle && item.circle > values.utopianVision.circle}>{item.name}</option>)}
        </select></label>
        {definition?.circle && <small>Utopians Circle {definition.circle}; reviewed Circle: {values.utopianVision.circle}.</small>}
        {!!definition?.choices.length && <label>Ability choice {index+1}<select aria-label={'Ability choice '+(index+1)} value={row.choice} onChange={e=>change('abilities',abilities.map((item,i)=>i===index?{...item,choice:e.target.value}:item))}>
          <option value="">Not recorded</option>{definition.choices.map(value=><option key={value}>{value}</option>)}
        </select></label>}
        {text('Ability notes '+(index+1),row.notes,value=>change('abilities',abilities.map((item,i)=>i===index?{...item,notes:value}:item)))}
        {canManage && <button type="button" className="crew-secondary" onClick={()=>change('abilities',abilities.filter((_,i)=>i!==index))}>Remove ability {index+1}</button>}
      </div>
    })}
    {canManage && <button type="button" onClick={()=>change('abilities',[...abilities,{id:crypto.randomUUID(),catalogId:choices.abilities[0].id,choice:'',notes:''}])}>Add crew ability</button>}
    <h4>Crew upgrades</h4>
    {upgrades.map((row,index)=><div className="crew-tool-row" key={row.id}>
      <label>Upgrade {index+1}<select aria-label={'Upgrade '+(index+1)} value={row.catalogId} onChange={e=>change('upgrades',upgrades.map((item,i)=>i===index?{...item,catalogId:e.target.value,marks:0}:item))}>
        {!choices.upgrades.some(item=>item.id===row.catalogId) && <option value={row.catalogId}>Previous crew selection — remove or replace</option>}
        {choices.upgrades.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label>Upgrade marks {index+1}<input aria-label={'Upgrade marks '+(index+1)} type="number" required min={0} max={choices.upgrades.find(item=>item.id===row.catalogId)?.max??3} step={1} value={row.marks} onChange={e=>change('upgrades',upgrades.map((item,i)=>i===index?{...item,marks:e.target.valueAsNumber}:item))}/></label>
      {text('Upgrade notes '+(index+1),row.notes,value=>change('upgrades',upgrades.map((item,i)=>i===index?{...item,notes:value}:item)))}
      {canManage && <button type="button" className="crew-secondary" onClick={()=>change('upgrades',upgrades.filter((_,i)=>i!==index))}>Remove upgrade {index+1}</button>}
    </div>)}
    {canManage && <button type="button" onClick={()=>change('upgrades',[...upgrades,{id:crypto.randomUUID(),catalogId:choices.upgrades[0].id,marks:0,notes:''}])}>Add crew upgrade</button>}
    <h4>Claims</h4><p>Editable claim records; map adjacency and availability are GM decisions. Repeated names identify separate printed claim spaces.</p>
    <div className="crew-claims" role="group" aria-label="Crew claims">{choices.claims.map((claim)=>{
      const siblings=choices.claims.filter(item=>item.name===claim.name)
      const label=claim.name+(siblings.length>1?' ('+(siblings.findIndex(item=>item.id===claim.id)+1)+')':'')
      const selected=claims.find(item=>item.catalogId===claim.id)
      return <div key={claim.id}><label className="crew-checkbox"><input type="checkbox" disabled={!!claim.circle && claim.circle > values.utopianVision.circle && !selected} checked={!!selected} onChange={e=>change('claims',e.target.checked?[...claims,{catalogId:claim.id,notes:''}]:claims.filter(item=>item.catalogId!==claim.id))}/>{label}</label>{claim.circle && <small>Circle {claim.circle}</small>}
        {selected && text('Claim notes '+label,selected.notes,value=>change('claims',claims.map(item=>item.catalogId===claim.id?{...item,notes:value}:item)))}
      </div>
    })}</div>
    {claims.filter(row=>!choices.claims.some(item=>item.id===row.catalogId)).map(row=><div key={row.catalogId}><p>Previous crew claim: {row.catalogId}</p>{canManage&&<button type="button" onClick={()=>change('claims',claims.filter(item=>item.catalogId!==row.catalogId))}>Remove previous claim {row.catalogId}</button>}</div>)}
    <h3>Cohorts</h3><p>Record current Quality and scale deliberately; Tier edits never silently change cohorts. Gang types: Eggheads, Hustlers, Runners, Infiltrators, Muscle. Expert types describe their expertise. Edges: Fearsome, Independent, Loyal, Resourceful, Tenacious, Vigilant. Flaws: Clumsy, Hedonistic, Panicky, Principled, Ruthless, Superstitious. Vehicle and ability exceptions can be recorded in notes.</p>
    {cohorts.map((row,index)=><fieldset className="crew-cohort" key={row.id}><legend>Cohort {index+1}</legend><small>Reference: {row.id}</small><div className="crew-fields">
      {text('Cohort name '+(index+1),row.name,value=>editCohort(index,{name:value}),100)}
      <label>Cohort kind {index+1}<select aria-label={'Cohort kind '+(index+1)} value={row.kind} onChange={e=>editCohort(index,{kind:e.target.value as CrewCohort['kind']})}><option value="gang">Gang</option><option value="expert">Expert</option><option value="vehicle">Vehicle (ability exception)</option></select></label>
      {(['types','edges','flaws','assignment','notes'] as const).map(field=>text('Cohort '+field+' '+(index+1),row[field],value=>editCohort(index,{[field]:value})))}
      {(['quality','scale'] as const).map(field=><label key={field}>Cohort {field==='quality'?'Quality':field} {index+1}<input aria-label={'Cohort '+(field==='quality'?'Quality':field)+' '+(index+1)} type="number" required min={0} max={99} step={1} value={row[field]} onChange={e=>editCohort(index,{[field]:e.target.valueAsNumber})}/></label>)}
      <label>Cohort condition {index+1}<select aria-label={'Cohort condition '+(index+1)} value={row.condition} onChange={e=>editCohort(index,{condition:e.target.value as CrewCohort['condition']})}>{['healthy','weakened','impaired','broken','dead'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Cohort Armor {index+1}<select aria-label={'Cohort Armor '+(index+1)} value={row.armor} onChange={e=>editCohort(index,{armor:e.target.value as CrewCohort['armor']})}>{['none','available','totaled'].map(value=><option key={value}>{value}</option>)}</select></label>
    </div>{canManage && <button type="button" className="crew-secondary" onClick={()=>change('cohorts',cohorts.filter((_,i)=>i!==index))}>Remove cohort {index+1}</button>}</fieldset>)}
    {canManage && <button type="button" onClick={()=>change('cohorts',[...cohorts,{id:crypto.randomUUID(),name:'New cohort',kind:'gang',types:'',edges:'',flaws:'',quality:values.tier,scale:values.tier,condition:'healthy',armor:'none',assignment:'',notes:''}])}>Add cohort</button>}
    <p><small>Sources: official crew sheets v6, six crew pages; Blades ’68 v1.0.1 pp. 91–95, 97–149. Reviewed Utopian Circles are enforced; advancement consequences and claim-map connections stay with the GM.</small></p>
  </div>
}
