import { createHash } from 'node:crypto';

export const COMMUNITY_PALETTE_VERSION = 2;
const PALETTE = ['#4da2ff', '#ff6b6b', '#9b6dff', '#f2c94c', '#46c979',
  '#ff934f', '#35c3c1', '#f075bd', '#a3acbf'];

export function normalizeCommunity(raw) {
  if (typeof raw !== 'string') return { key: 'unknown', label: 'Unknown / unlisted' };
  const label = raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const key = label.toLocaleLowerCase('en-US')
    .replace(/[\p{Pd}_]+/gu, ' ')
    .replace(/\s+/gu, ' ').trim();
  if (!key || !/[\p{L}\p{N}]/u.test(key)) return { key: 'unknown', label: 'Unknown / unlisted' };
  return { key, label };
}

export function stableColor(key) {
  if (key === 'unknown') return '#8190a6';
  const value = createHash('sha256').update(key).digest().readUInt32BE(0);
  const hue = ((value * 137.507764) % 360) / 60;
  const chroma = 0.63;
  const x = chroma * (1 - Math.abs(hue % 2 - 1));
  const rgb = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0]
    : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma]
      : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${rgb.map((part) => Math.round((part + 0.2) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function groupCommunities(cards, previous = []) {
  const oldColors = new Map(previous.map((item) => [item.key, item.color]));
  const groups = new Map();
  for (const card of cards) {
    const { key, label } = normalizeCommunity(card.communityRaw);
    const group = groups.get(key) ?? { key, counts: new Map(), count: 0 };
    group.count++;
    group.counts.set(label, (group.counts.get(label) ?? 0) + 1);
    groups.set(key, group);
    card.communityKey = key;
  }
  const communities = [...groups.values()].map((group) => {
    const label = [...group.counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    return { key: group.key, label, color: oldColors.get(group.key) ?? '', count: group.count };
  }).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const used = new Set(communities.map((item) => item.color).filter(Boolean));
  for (const community of communities) {
    if (community.color) continue;
    community.color = community.key === 'unknown' ? '#8190a6'
      : (PALETTE.find((color) => !used.has(color)) ?? stableColor(community.key));
    used.add(community.color);
  }
  const labels = new Map(communities.map((c) => [c.key, c.label]));
  for (const card of cards) card.communityLabel = labels.get(card.communityKey);
  return communities;
}
