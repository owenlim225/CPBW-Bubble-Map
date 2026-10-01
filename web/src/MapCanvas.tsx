import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { makeLayout, type PlacedCard } from './layout'
import type { BuilderCard, Community } from './types'

interface Props {
  cards: BuilderCard[]
  allCards: BuilderCard[]
  communities: Community[]
  selectedId: string | null
  onSelect: (card: BuilderCard) => void
  reducedMotion: boolean
}

interface Camera { x: number; y: number; scale: number }

const bubbleRadius = 8

export function MapCanvas({ cards, allCards, communities, selectedId, onSelect, reducedMotion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 })
  const [hovered, setHovered] = useState<PlacedCard | null>(null)
  const [size, setSize] = useState({ width: 800, height: 500 })
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null)
  const layout = useMemo(() => makeLayout(allCards, communities), [allCards, communities])
  const visibleIds = useMemo(() => new Set(cards.map(c => c.cardObjectId)), [cards])
  const visible = useMemo(() => layout.cards.filter(p => visibleIds.has(p.card.cardObjectId)), [layout, visibleIds])

  const fit = useCallback(() => {
    const { minX, minY, maxX, maxY } = layout.bounds
    const scale = Math.min(2.2, Math.max(0.12, Math.min((size.width - 60) / (maxX - minX), (size.height - 60) / (maxY - minY))))
    setCamera({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, scale })
  }, [layout, size])

  useEffect(() => { fit() }, [fit])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect
      setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const px = event.clientX - rect.left - rect.width / 2
      const py = event.clientY - rect.top - rect.height / 2
      setCamera(current => {
        const nextScale = Math.min(5, Math.max(.12, current.scale * (event.deltaY < 0 ? 1.1 : .9)))
        return { x: current.x + px / current.scale - px / nextScale, y: current.y + py / current.scale - py / nextScale, scale: nextScale }
      })
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    let active = true
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const draw = (time: number) => {
      if (!active) return
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, size.width, size.height)
      context.fillStyle = '#0f1d30'
      context.fillRect(0, 0, size.width, size.height)
      const toScreen = (x: number, y: number) => ({ x: (x - camera.x) * camera.scale + size.width / 2, y: (y - camera.y) * camera.scale + size.height / 2 })
      context.save()
      context.strokeStyle = 'rgba(167,195,211,.055)'
      context.lineWidth = 1
      const grid = 80 * camera.scale
      if (grid > 13) {
        const offsetX = ((-camera.x * camera.scale + size.width / 2) % grid + grid) % grid
        const offsetY = ((-camera.y * camera.scale + size.height / 2) % grid + grid) % grid
        for (let x = offsetX; x < size.width; x += grid) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, size.height); context.stroke() }
        for (let y = offsetY; y < size.height; y += grid) { context.beginPath(); context.moveTo(0, y); context.lineTo(size.width, y); context.stroke() }
      }
      context.restore()

      for (const cluster of layout.clusters) {
        const p = toScreen(cluster.x, cluster.y)
        const r = cluster.radius * camera.scale
        if (p.x + r < 0 || p.x - r > size.width || p.y + r < 0 || p.y - r > size.height) continue
        context.beginPath()
        context.arc(p.x, p.y, r, 0, Math.PI * 2)
        context.fillStyle = `${cluster.color}12`
        context.fill()
        context.setLineDash([5, 6])
        context.lineWidth = 1
        context.strokeStyle = `${cluster.color}65`
        context.stroke()
        context.setLineDash([])
      }

      const labelBoxes: { left: number; right: number; top: number; bottom: number }[] = []
      context.font = '600 11px system-ui, sans-serif'
      context.textAlign = 'center'
      const orderedLabels = [...layout.clusters].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      for (const cluster of size.width < 500 ? orderedLabels.slice(0, 1) : orderedLabels) {
        const p = toScreen(cluster.x, cluster.y)
        const r = cluster.radius * camera.scale
        if (p.x + r < 0 || p.x - r > size.width || p.y + r < 0 || p.y - r > size.height) continue
        const lines: string[] = []
        for (const word of cluster.label.split(/\s+/)) {
          const current = lines.at(-1)
          if (current && context.measureText(`${current} ${word}`).width <= 108) lines[lines.length - 1] = `${current} ${word}`
          else lines.push(word)
        }
        if (lines.length > 3) lines.splice(2, lines.length - 2, `${lines.slice(2).join(' ').slice(0, 14)}…`)
        const width = Math.min(116, Math.max(55, ...lines.map(line => context.measureText(line).width + 12)))
        const height = lines.length * 14 + 4
        const above = p.y - r - height - 7
        const below = p.y + r + 8
        const options = cluster.y < 0 ? [above, below] : [below, above]
        const labelTop = options.find(top => {
          const box = { left: p.x - width / 2, right: p.x + width / 2, top, bottom: top + height }
          return !labelBoxes.some(other => box.left < other.right + 2 && box.right > other.left - 2 && box.top < other.bottom + 2 && box.bottom > other.top - 2)
        })
        if (labelTop === undefined) continue
        const box = { left: p.x - width / 2, right: p.x + width / 2, top: labelTop, bottom: labelTop + height }
        labelBoxes.push(box)
        context.fillStyle = 'rgba(14,29,47,.88)'
        context.fillRect(box.left, box.top, width, height)
        context.fillStyle = '#e5edf3'
        lines.forEach((line, i) => context.fillText(line, p.x, labelTop + 13 + i * 14, width - 8))
      }

      const selected = visible.find(p => p.card.cardObjectId === selectedId)
      if (selected) {
        const a = toScreen(0, 0)
        const b = toScreen(selected.x, selected.y)
        context.beginPath()
        context.moveTo(a.x, a.y)
        context.lineTo(b.x, b.y)
        context.strokeStyle = 'rgba(255,219,139,.8)'
        context.lineWidth = 1.5
        context.stroke()
      }
      const registry = toScreen(0, 0)
      context.beginPath()
      context.arc(registry.x, registry.y, Math.max(7, 10 * camera.scale), 0, Math.PI * 2)
      context.fillStyle = '#ffda89'
      context.fill()
      context.beginPath()
      context.arc(registry.x, registry.y, Math.max(13, 17 * camera.scale), 0, Math.PI * 2)
      context.strokeStyle = 'rgba(255,218,137,.65)'
      context.stroke()
      context.fillStyle = '#ffecbd'
      context.font = '600 11px system-ui, sans-serif'
      context.textAlign = 'left'
      context.fillText(size.width < 500 ? 'REGISTRY' : 'BUILDER REGISTRY', registry.x + 16, registry.y + 4)

      const animate = !reducedMotion && visible.length <= 2500
      for (const point of visible) {
        const phase = (point.card.cardObjectId.charCodeAt(point.card.cardObjectId.length - 1) || 0) * 0.26
        const bob = animate ? Math.sin(time * .0007 + phase) * 1.4 : 0
        const p = toScreen(point.x, point.y + bob)
        const r = Math.max(4.5, bubbleRadius * Math.sqrt(camera.scale))
        if (p.x + r < 0 || p.x - r > size.width || p.y + r < 0 || p.y - r > size.height) continue
        const emphasized = point.card.cardObjectId === selectedId || point.card.cardObjectId === hovered?.card.cardObjectId
        if (emphasized) {
          context.beginPath()
          context.arc(p.x, p.y, r + 6, 0, Math.PI * 2)
          context.fillStyle = `${point.color}44`
          context.fill()
        }
        context.beginPath()
        context.arc(p.x, p.y, r, 0, Math.PI * 2)
        context.fillStyle = point.color
        context.fill()
        context.strokeStyle = emphasized ? '#ffffff' : 'rgba(255,255,255,.45)'
        context.lineWidth = emphasized ? 2 : 1
        context.stroke()
      }
      if (animate) frameRef.current = requestAnimationFrame(draw)
    }
    frameRef.current = requestAnimationFrame(draw)
    return () => { active = false; cancelAnimationFrame(frameRef.current) }
  }, [camera, hovered, layout, reducedMotion, selectedId, size, visible])

  const locate = (clientX: number, clientY: number): PlacedCard | null => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = clientX - rect.left
    const y = clientY - rect.top
    let hit: PlacedCard | null = null
    let best = Math.max(14, bubbleRadius * Math.sqrt(camera.scale) + 5) ** 2
    for (const point of visible) {
      const px = (point.x - camera.x) * camera.scale + size.width / 2
      const py = (point.y - camera.y) * camera.scale + size.height / 2
      const d = (px - x) ** 2 + (py - y) ** 2
      if (d < best) { best = d; hit = point }
    }
    return hit
  }

  const zoom = (factor: number) => setCamera(current => ({ ...current, scale: Math.min(5, Math.max(.12, current.scale * factor)) }))

  return <div className="map-wrap">
    <canvas
      ref={canvasRef}
      className="map-canvas"
      aria-label="Interactive bubble map. Use the list view to browse every BuilderCard with a keyboard."
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { x: event.clientX, y: event.clientY, originX: camera.x, originY: camera.y, moved: false }
      }}
      onPointerMove={event => {
        const drag = dragRef.current
        if (drag) {
          const dx = event.clientX - drag.x
          const dy = event.clientY - drag.y
          if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
          if (drag.moved) setCamera(c => ({ ...c, x: drag.originX - dx / c.scale, y: drag.originY - dy / c.scale }))
        } else setHovered(locate(event.clientX, event.clientY))
      }}
      onPointerUp={event => {
        const wasDrag = dragRef.current?.moved
        dragRef.current = null
        if (!wasDrag) { const hit = locate(event.clientX, event.clientY); if (hit) onSelect(hit.card) }
      }}
      onPointerCancel={() => { dragRef.current = null }}
      onPointerLeave={() => setHovered(null)}
    />
    <div className="map-tools" aria-label="Map controls">
      <button onClick={() => zoom(1.3)} aria-label="Zoom in">+</button>
      <button onClick={() => zoom(1 / 1.3)} aria-label="Zoom out">−</button>
      <button onClick={fit} aria-label="Fit all bubbles">⌗</button>
    </div>
    <div className="map-caption">Drag to pan · Scroll to zoom · Select a bubble for details</div>
    {hovered && <div className="map-hover" role="status"><strong>{hovered.card.builderName || `Builder #${hovered.card.builderNo ?? '?'}`}</strong><span>{hovered.card.communityLabel}</span></div>}
  </div>
}
