import type { BuilderCard, Community } from './types'

export interface Point { x: number; y: number }
export interface PlacedCard extends Point { card: BuilderCard; color: string; group: string }
export interface Cluster extends Point { key: string; label: string; color: string; count: number; radius: number }
export interface Layout { cards: PlacedCard[]; clusters: Cluster[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function makeLayout(cards: BuilderCard[], communities: Community[]): Layout {
  const groups = new Map<string, BuilderCard[]>()
  for (const card of cards) {
    const group = groups.get(card.communityKey) ?? []
    group.push(card)
    groups.set(card.communityKey, group)
  }
  const ordered = communities.filter(c => groups.has(c.key)).sort((a, b) => hash(a.key) - hash(b.key) || a.key.localeCompare(b.key))
  const clusters: Cluster[] = []
  const placed: PlacedCard[] = []
  // Balanced two-row groups use the wide viewport and leave the registry clear.
  const slotOrder = [2, 7, 1, 8, 3, 6, 0, 9, 4, 5]
  for (let index = 0; index < ordered.length; index++) {
    const community = ordered[index]
    const groupCards = (groups.get(community.key) ?? []).sort((a, b) => a.cardObjectId.localeCompare(b.cardObjectId))
    const rowPair = Math.floor(index / 10)
    const slot = slotOrder[index % 10]
    const centerX = (slot % 5 - 2) * 230
    const centerY = (slot < 5 ? -1 : 1) * (220 + rowPair * 440)
    const radius = Math.max(52, Math.sqrt(groupCards.length) * 16 + 30)
    clusters.push({ x: centerX, y: centerY, key: community.key, label: community.label, color: community.color, count: groupCards.length, radius })
    // Golden-angle placement spreads a dense group evenly without a random simulation.
    for (let i = 0; i < groupCards.length; i++) {
      const card = groupCards[i]
      const seed = hash(card.cardObjectId)
      const angle = i * 2.399963229728653 + (seed % 100) / 1000
      const distance = 16 + Math.sqrt(i) * 15
      placed.push({ x: centerX + Math.cos(angle) * distance, y: centerY + Math.sin(angle) * distance, card, color: community.color, group: community.key })
    }
  }
  const extent = clusters.length ? {
    minX: Math.min(0, ...clusters.map(c => c.x - Math.max(c.radius, 110))) - 65,
    minY: Math.min(0, ...clusters.map(c => c.y - Math.max(c.radius, 110))) - 65,
    maxX: Math.max(0, ...clusters.map(c => c.x + Math.max(c.radius, 110))) + 65,
    maxY: Math.max(0, ...clusters.map(c => c.y + Math.max(c.radius, 110))) + 65,
  } : { minX: -180, minY: -180, maxX: 180, maxY: 180 }
  return { cards: placed, clusters, bounds: extent }
}
