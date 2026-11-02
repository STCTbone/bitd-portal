import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { mapPoint, type MapPoint } from '@/lib/maps'
import { useMapActivity, type GestureKind } from '@/lib/map-activity'
import './MapCollaboration.css'
function color(actor: string) {
  const palette = ['#076a77','#a53362','#6e42a1','#9b4f06','#285f30','#264b9e']
  return palette[parseInt(actor.slice(0,4),16) % palette.length]
}
function ActivityOverlay({ campaign, asset, mode }: { campaign: string; asset: string; mode: GestureKind }) {
  const { activity, connected, send } = useMapActivity(campaign, asset)
  const drawing = useRef<MapPoint[] | null>(null), last = useRef(0)
  function point(event: PointerEvent<HTMLDivElement>) { return mapPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()) }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (mode === 'stroke' && drawing.current) {
      const next = point(event)
      // Keep beginning/end and a bounded sampled path during long gestures.
      if (drawing.current.length >= 63) drawing.current = drawing.current.filter((_,index) => index % 2 === 0)
      drawing.current.push(next)
    }
    if (Date.now() - last.current < 80) return
    last.current = Date.now()
    if (mode === 'stroke' && drawing.current) send('stroke', [...drawing.current])
    else if (mode === 'cursor' && event.pointerType !== 'touch') send('cursor',[point(event)])
  }
  return <>
    <div data-live-map className={`live-map-overlay live-map-${mode}`} aria-label="Live map gestures"
      onPointerMove={move}
      onPointerDown={event => {
        if (event.button !== 0) return
        if (mode === 'stroke') { event.currentTarget.setPointerCapture(event.pointerId); drawing.current=[point(event)]; send('stroke',[...drawing.current]) }
        else send(mode,[point(event)])
      }}
      onPointerUp={event => { if (drawing.current) { drawing.current.push(point(event)); send('stroke',drawing.current); drawing.current=null } }}
      onPointerCancel={() => { drawing.current=null }}>
      {activity.map(row => {
        const first = row.points[0], label = `${row.role === 'gm' ? 'GM' : 'Player'} ${row.actor.slice(0,6)}`
        return <div key={`${row.actor}:${row.kind}`} data-activity-actor={row.actor} data-activity-kind={row.kind} className={`live-gesture live-${row.kind}`} style={{ color:color(row.actor), ...(row.kind==='stroke'?{}:{left:`${first.x}%`,top:`${first.y}%`}) }} title={`${label} · ${row.actor}`}>
          {row.kind==='stroke' ? <><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${label} drawing`}><polyline points={row.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg><span className="live-gesture-name live-stroke-name" style={{left:`${first.x}%`,top:`${Math.max(0,first.y-5)}%`}}>{label}</span></> : <><span className="live-gesture-symbol">{row.kind==='cursor'?'↖':'◎'}</span><span className="live-gesture-name">{label}</span></>}
        </div>
      })}
    </div>
    <span className="live-map-status" role="status">{connected?'Live map connected.':'Live map unavailable; reconnecting.'}</span>
  </>
}
export function MapCollaboration({campaign,asset,children}:{campaign:string;asset:string;children:(overlay:ReactNode)=>ReactNode}) {
  const [mode,setMode] = useState<GestureKind>('cursor'), [joined,setJoined] = useState(true)
  return <>
    <div className="live-map-tools" aria-label="Live map tools">
      {joined ? <>
        <button aria-pressed={mode==='cursor'} onClick={()=>setMode('cursor')}>Show cursor</button>
        <button aria-pressed={mode==='ping'} onClick={()=>setMode('ping')}>Ping map</button>
        <button aria-pressed={mode==='stroke'} onClick={()=>setMode('stroke')}>Draw on map</button>
        <button onClick={()=>setJoined(false)}>Leave live map</button>
      </> : <button onClick={()=>setJoined(true)}>Join live map</button>}
    </div>
    {children(joined ? <ActivityOverlay campaign={campaign} asset={asset} mode={mode}/> : null)}
  </>
}
