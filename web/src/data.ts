import type { BuilderCard, Manifest } from './types'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
const registryId = '0x297cb610c0c47edc1e12008812f28cd8a1f35f95bb406d45f4b76fa9fda2e04c'

function dataUrl(path: string): string {
  const safe = path.replace(/^\/+/, '')
  if (!/^data\/[\w./-]+$/.test(safe) || safe.includes('..')) throw new Error('Invalid snapshot path')
  return `${base}/${safe}`
}

async function fetchJson(path: string, cache: RequestCache = 'default'): Promise<unknown> {
  const response = await fetch(dataUrl(path), { cache })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response.json()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function validateManifest(value: unknown): asserts value is Manifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.network !== 'mainnet' ||
    value.registryId !== registryId || typeof value.generatedAt !== 'string' || typeof value.lastSyncedAt !== 'string' ||
    typeof value.completeHistory !== 'boolean' || !Array.isArray(value.coverageGaps) ||
    !Array.isArray(value.communities) || !Array.isArray(value.shards) ||
    !Number.isSafeInteger(value.totalCards) || !Number.isSafeInteger(value.totalCommunities)) {
    throw new Error('Unsupported or invalid snapshot manifest')
  }
  if (!value.communities.every(c => isRecord(c) && typeof c.key === 'string' && typeof c.label === 'string' && typeof c.color === 'string' && Number.isSafeInteger(c.count))) {
    throw new Error('Invalid community manifest')
  }
  if (!value.shards.every(s => isRecord(s) && typeof s.path === 'string' && typeof s.sha256 === 'string' && Number.isSafeInteger(s.count))) {
    throw new Error('Invalid shard manifest')
  }
}

function validateCard(value: unknown): value is BuilderCard {
  return isRecord(value) &&
    ['cardObjectId', 'txDigest', 'timestamp', 'sender', 'packageId', 'objectType', 'builderName', 'communityRaw', 'communityKey', 'communityLabel'].every(key => typeof value[key] === 'string') &&
    Number.isSafeInteger(value.checkpoint) &&
    typeof value.builderNo === 'string' && /^\d+$/.test(value.builderNo) &&
    ['profession', 'focus', 'country'].every(key => typeof value[key] === 'string') &&
    (value.websiteUrl === null || typeof value.websiteUrl === 'string')
}

async function fetchShard(path: string, expectedHash: string): Promise<unknown> {
  const response = await fetch(dataUrl(path))
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  const bytes = await response.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  if (actual !== expectedHash.toLowerCase()) throw new Error(`${path}: integrity check failed`)
  return JSON.parse(new TextDecoder().decode(bytes))
}

export async function loadSnapshot(): Promise<{ manifest: Manifest; cards: BuilderCard[] }> {
  const manifestValue = await fetchJson('data/manifest.json', 'no-store')
  validateManifest(manifestValue)
  const manifest = manifestValue
  const shards = await Promise.all(manifest.shards.map(async shard => {
    const value = await fetchShard(shard.path, shard.sha256)
    if (!Array.isArray(value) || value.length !== shard.count || !value.every(validateCard)) {
      throw new Error(`${shard.path}: invalid card data`)
    }
    return value as BuilderCard[]
  }))
  const cards = shards.flat().sort((a, b) => a.checkpoint - b.checkpoint || a.timestamp.localeCompare(b.timestamp) || a.cardObjectId.localeCompare(b.cardObjectId))
  if (cards.length !== manifest.totalCards || new Set(cards.map(c => c.cardObjectId)).size !== cards.length) {
    throw new Error('Snapshot card count or identities are inconsistent')
  }
  const communityKeys = new Set(manifest.communities.map(c => c.key))
  if (manifest.communities.length !== manifest.totalCommunities || cards.some(c => !communityKeys.has(c.communityKey))) {
    throw new Error('Snapshot community mapping is inconsistent')
  }
  return { manifest, cards }
}

export async function loadManifest(): Promise<Manifest> {
  const value = await fetchJson('data/manifest.json', 'no-store')
  validateManifest(value)
  return value
}
