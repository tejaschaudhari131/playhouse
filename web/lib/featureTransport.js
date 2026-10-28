/** Lossless transport dictionary. Geometry, feature IDs and property values are
 * unchanged; repeated property names and equal values travel once per part.
 */
export function encodeFeatureTransport(collection) {
  const propertyKeys = [...new Set(collection.features.flatMap(feature => Object.keys(feature.properties || {})))].sort()
  const indexes = propertyKeys.map(() => new Map()), propertyValues = propertyKeys.map(() => [])
  const features = collection.features.map(feature => ({ ...feature, properties: propertyKeys.map((key, column) => {
    if (!Object.hasOwn(feature.properties || {}, key)) return -1
    const value = feature.properties[key], signature = JSON.stringify(value)
    if (!indexes[column].has(signature)) {
      indexes[column].set(signature, propertyValues[column].length)
      propertyValues[column].push(value)
    }
    return indexes[column].get(signature)
  }) }))
  return { ...collection, transport: 'properties-dictionary-v1', propertyKeys, propertyValues, features }
}

export function decodeFeatureTransport(payload) {
  if (payload?.transport !== 'properties-dictionary-v1') return payload
  const { transport, propertyKeys, propertyValues, features, ...collection } = payload
  if (!Array.isArray(propertyKeys) || !Array.isArray(propertyValues) || propertyKeys.length !== propertyValues.length || !Array.isArray(features)) throw new Error('Invalid neighborhood property dictionary')
  return { ...collection, features: features.map(feature => {
    if (!Array.isArray(feature.properties) || feature.properties.length !== propertyKeys.length) throw new Error('Invalid neighborhood property row')
    const properties = {}
    for (let column = 0; column < propertyKeys.length; column++) {
      const index = feature.properties[column]
      if (index === -1) continue
      if (!Number.isInteger(index) || index < 0 || !Array.isArray(propertyValues[column]) || index >= propertyValues[column].length) throw new Error('Invalid neighborhood property reference')
      const key = propertyKeys[column], value = propertyValues[column][index]
      if (key === '__proto__') Object.defineProperty(properties, key, { value, enumerable: true, writable: true, configurable: true })
      else properties[key] = value
    }
    return { ...feature, properties }
  }) }
}
