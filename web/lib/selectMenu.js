export function optionIndex(options, current, direction) {
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index])
  if (!enabled.length) return -1
  if (direction === 'first') return enabled[0]
  if (direction === 'last') return enabled.at(-1)
  const position = enabled.indexOf(current)
  if (position < 0) return direction < 0 ? enabled.at(-1) : enabled[0]
  return enabled[Math.max(0, Math.min(enabled.length - 1, position + direction))]
}

const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()

export function matchingOption(options, query, current = -1, cycle = false) {
  if (!query || !options.length) return -1
  const start = Math.max(0, current + (cycle ? 1 : 0))
  for (let offset = 0; offset < options.length; offset++) {
    const index = (start + offset) % options.length
    if (!options[index].disabled && normalize(options[index].text).startsWith(normalize(query))) return index
  }
  return -1
}

export function selectMenuPosition(rect, viewport, contentHeight = 320) {
  const margin = 8, gap = 4
  const x = viewport.offsetLeft || 0, y = viewport.offsetTop || 0
  const width = Math.min(Math.max(rect.width, 240), Math.max(0, viewport.width - margin * 2))
  const left = Math.max(x + margin, Math.min(rect.left, x + viewport.width - width - margin))
  const below = Math.max(0, y + viewport.height - rect.bottom - gap - margin)
  const above = Math.max(0, rect.top - y - gap - margin)
  const upwards = below < Math.min(contentHeight, 240) && above > below
  const maxHeight = Math.min(contentHeight, upwards ? above : below)
  return { left, top: upwards ? rect.top - gap - maxHeight : rect.bottom + gap, width, maxHeight }
}
