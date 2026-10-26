import { Marker } from 'maplibre-gl'
import { geometryBounds, geometryCenter } from './plannerGeometry.js'

/** Decorative feedback only: one small marker, compositor animations, no map-data uploads. */
export function playDemolitionEffect(map, feature) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const center = geometryCenter(feature?.geometry), bounds = geometryBounds(feature?.geometry)
  if (motion.matches || !center || !bounds) return

  const origin = map.project(center)
  const corners = [[bounds[0], bounds[1]], [bounds[0], bounds[3]], [bounds[2], bounds[1]], [bounds[2], bounds[3]]].map(p => map.project(p))
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
  const width = clamp(Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x)), 12, 72)
  const depth = clamp(Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y)), 8, 44)
  const metre = map.project([center[0] + 1 / (111320 * Math.cos(center[1] * Math.PI / 180)), center[1]])
  const height = clamp((Number(feature.properties?.height_m) || 6) * Math.hypot(metre.x - origin.x, metre.y - origin.y) * Math.sin(map.getPitch() * Math.PI / 180), 0, 60)
  const root = document.createElement('div')
  root.className = 'demolition-effect'
  root.setAttribute('aria-hidden', 'true')
  root.style.setProperty('--debris-color', feature.properties?.use_color || '#94a3b8')
  root.style.setProperty('--debris-size', `${clamp(width / 4, 6, 13)}px`)
  const svgNS = 'http://www.w3.org/2000/svg'
  for (let i = 0; i < 9; i++) {
    const x = i % 3 - 1, y = Math.floor(i / 3) - 1
    const startX = x * width * .25, startY = y * depth * .2 - height * (.2 + (i % 3) * .2)
    const driftX = x * (9 + (i % 2) * 4) + (x ? 0 : (i % 2 ? 4 : -4))
    const driftY = y * 6 + 12
    const block = document.createElement('span')
    block.className = 'demolition-block'
    for (const [key, value] of Object.entries({ sx: startX, sy: startY, mx: startX + driftX * .55, my: startY - 5, ex: startX + driftX, ey: startY + driftY })) block.style.setProperty(`--${key}`, `${value}px`)
    block.style.setProperty('--turn', `${x * 14 + y * 5}deg`)
    block.style.animationDelay = `${i % 3 * 12}ms`
    const cube = document.createElementNS(svgNS, 'svg')
    cube.setAttribute('viewBox', '0 0 24 26')
    // Three shaded faces read as little blocks, without a physics/3D dependency.
    for (const [points, face] of [['12,1 23,7 12,13 1,7', 'top'], ['1,7 12,13 12,25 1,19', 'left'], ['12,13 23,7 23,19 12,25', 'right']]) {
      const polygon = document.createElementNS(svgNS, 'polygon')
      polygon.setAttribute('points', points); polygon.setAttribute('class', `demolition-face-${face}`)
      cube.append(polygon)
    }
    block.append(cube); root.append(block)
  }
  const marker = new Marker({ element: root, anchor: 'center' }).setLngLat(center).addTo(map)
  let timer, disposed = false
  const cleanup = () => {
    if (disposed) return
    disposed = true
    clearTimeout(timer)
    motion.removeEventListener('change', cleanup)
    map.off('remove', cleanup)
    marker.remove()
  }
  motion.addEventListener('change', cleanup)
  map.on('remove', cleanup)
  timer = setTimeout(cleanup, 700)
  return cleanup
}
