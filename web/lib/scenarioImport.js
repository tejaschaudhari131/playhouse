import { MODEL_VERSION } from './plannerState.js'
import { MAX_PLAN_BYTES, PLAN_STORAGE_VERSION, parseSavedPlan, planBytes, validatePlan, migrateSavedScenario } from './planPersistence.js'

export const MAX_IMPORT_BYTES = 10_000_000
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
const networkFile = value => typeof value === 'string' && value.length < 250 && /^[a-zA-Z0-9._-]+\.json(?:\.gz)?$/.test(value) && !value.includes('..')
const networkEdits = scenario => scenario.connections.length || scenario.parks.length || scenario.routes.length

/** Scan the complete untrusted export, including discarded results, without recursive stack growth. */
function safeEnvelope(value) {
  const stack = [[value, 0]]
  while (stack.length) {
    const [item, depth] = stack.pop()
    if (depth > 64) return false
    if (!item || typeof item !== 'object') continue
    for (const [key, child] of Object.entries(item)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) return false
      stack.push([child, depth + 1])
    }
  }
  return true
}

/**
 * Imports inputs only; scores, HTML and other derived export fields are discarded.
 * Legacy exports with only a source SHA are verified against the current network
 * when restorePlanContext loads the imported parcel, not the currently viewed one.
 */
export function parseScenarioImport(raw) {
  const fail = issue => ({ saved: null, issue, migrated: false, notices: [] })
  if (typeof raw !== 'string' || planBytes(raw) > MAX_IMPORT_BYTES) return fail('Choose a JSON export smaller than 10 MB.')
  let payload
  try { payload = JSON.parse(raw) } catch { return fail('This file is not valid JSON. Choose a Playhouse scenario export.') }
  if (!object(payload) || !safeEnvelope(payload)) return fail('The file contains invalid or unsafe object fields.')
  if (payload.version === PLAN_STORAGE_VERSION && payload.schemaVersion === undefined) {
    const parsed = parseSavedPlan(raw)
    return { saved: parsed.saved, issue: parsed.issue, migrated: !!parsed.migrated, notices: parsed.migrated ? ['Legacy rent and income were preserved. Housing costs are excluded until reviewed; fit and capacity are now separate checks.'] : [] }
  }
  if (payload.schemaVersion === 3) return fail('This is an older A/B scenario export. Import supports the single-draft schema 7; keep this file for reference.')
  if (payload.schemaVersion !== 7) return fail('This scenario export uses an unsupported schema. Expected Playhouse schema 7.')
  if (payload.modelVersion && payload.modelVersion !== MODEL_VERSION && !/^planner-screen-[12](?:\.\d+)*$/.test(payload.modelVersion)) return fail('This export uses an unsupported scoring model. Open it with the Playhouse version that created it.')
  if (!object(payload.scenario) || planBytes(JSON.stringify(payload.scenario)) > MAX_PLAN_BYTES) return fail('Scenario inputs must be smaller than 2 MB.')
  const issue = validatePlan(payload.scenario)
  if (issue) return fail(issue.replace('saved', 'imported'))
  const sources = object(payload.sources) ? payload.sources : {}
  const file = networkFile(sources.networkFile) ? sources.networkFile : ''
  const sourceSha = sha(payload.networkContext) ? payload.networkContext : sha(sources.networkSha256) ? sources.networkSha256 : null
  if (networkEdits(payload.scenario) && !file && !sourceSha) return fail('This export has drawn infrastructure but no verifiable walking-network version. No edits were imported.')
  if (sources.networkFile && !file) return fail('The export has an invalid walking-network file reference.')
  const scenario = migrateSavedScenario(payload.scenario, payload.modelVersion || 'legacy')
  const migrated = scenario !== payload.scenario
  const notices = migrated ? ['Legacy rent and income were preserved. Housing costs are excluded until reviewed; fit and capacity are now separate checks.'] : []
  if (!file && sourceSha && networkEdits(scenario)) notices.push('The older export uses a network source fingerprint; its graph will be verified before restoring drawn changes.')
  return {
    saved: { version: PLAN_STORAGE_VERSION, modelVersion: MODEL_VERSION, savedAt: typeof payload.exportedAt === 'string' && payload.exportedAt.length <= 40 ? payload.exportedAt : null,
      sources: { dataVersion: typeof payload.dataVersion === 'string' && payload.dataVersion.length <= 100 ? payload.dataVersion : null, networkFile: file, ...(sourceSha ? { networkSha256: sourceSha } : {}) }, scenario },
    issue: null, migrated, notices,
  }
}
