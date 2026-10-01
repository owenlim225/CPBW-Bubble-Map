import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMUNITY_PALETTE_VERSION, groupCommunities } from './community.js';
import { REGISTRY_ID, SCHEMA_VERSION } from './constants.js';

export const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/public');
export const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const MANIFEST = path.join(DATA_DIR, 'manifest.json');
const CANDIDATES = path.join(DATA_DIR, 'candidates.json');

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (contents) => createHash('sha256').update(contents).digest('hex');

export function mergeRanges(ranges) {
  const sorted = ranges.map(([start, end]) => [Number(start), Number(end)])
    .filter(([start, end]) => Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

export function coverage({ firstRequiredCheckpoint, targetCheckpoint, scannedRanges, candidates, originVerified }) {
  const ranges = mergeRanges(scannedRanges);
  const gaps = [];
  let next = firstRequiredCheckpoint;
  if (next == null || !originVerified) {
    return { lastContiguousCheckpoint: null,
      coverageGaps: [{ fromCheckpoint: null, toCheckpoint: targetCheckpoint, reason: 'Registry origin checkpoint not verified' }],
      completeHistory: false };
  }
  for (const [start, end] of ranges) {
    if (end < next) continue;
    if (start > next) gaps.push({ fromCheckpoint: next, toCheckpoint: Math.min(start - 1, targetCheckpoint), reason: 'Not scanned' });
    next = Math.max(next, end + 1);
    if (next > targetCheckpoint) break;
  }
  if (next <= targetCheckpoint) gaps.push({ fromCheckpoint: next, toCheckpoint: targetCheckpoint, reason: 'Not scanned' });
  for (const candidate of candidates) {
    if (Number.isSafeInteger(candidate.checkpoint) && candidate.checkpoint >= firstRequiredCheckpoint && candidate.checkpoint <= targetCheckpoint) {
      gaps.push({ fromCheckpoint: candidate.checkpoint, toCheckpoint: candidate.checkpoint,
        reason: `Unclassified registry transaction: ${candidate.digest}` });
    }
  }
  gaps.sort((a, b) => a.fromCheckpoint - b.fromCheckpoint || a.toCheckpoint - b.toCheckpoint);
  const lastContiguousCheckpoint = gaps.length ? Math.max(firstRequiredCheckpoint - 1, gaps[0].fromCheckpoint - 1) : targetCheckpoint;
  return { lastContiguousCheckpoint, coverageGaps: gaps, completeHistory: gaps.length === 0 };
}

export async function loadSnapshot() {
  let manifest;
  try { manifest = JSON.parse(await readFile(MANIFEST, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return { manifest: null, cards: [], candidates: [] };
    throw error;
  }
  const cards = [];
  for (const shard of manifest.shards ?? []) {
    if (!/^data\/cards\/[0-9]{4}-[0-9]{2}-[a-f0-9]{12}\.json$/.test(shard.path)) throw new Error('Invalid shard path');
    const buffer = await readFile(path.join(PUBLIC_DIR, shard.path));
    if (sha256(buffer) !== shard.sha256) throw new Error(`Shard hash mismatch: ${shard.path}`);
    const batch = JSON.parse(buffer.toString('utf8'));
    if (!Array.isArray(batch) || batch.length !== shard.count) throw new Error(`Invalid shard: ${shard.path}`);
    cards.push(...batch);
  }
  let candidates = [];
  try { candidates = JSON.parse(await readFile(CANDIDATES, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { manifest, cards, candidates };
}

async function atomicWrite(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents);
  await rename(temporary, file);
}

export async function saveSnapshot({ cards, candidates, priorManifest, firstRequiredCheckpoint,
  originVerified, originTransactionSeen, scannedRanges, targetCheckpoint }) {
  const unique = new Set();
  for (const card of cards) {
    if (!card.cardObjectId || unique.has(card.cardObjectId)) throw new Error(`Duplicate or missing BuilderCard ID: ${card.cardObjectId}`);
    unique.add(card.cardObjectId);
  }
  cards.sort((a, b) => a.checkpoint - b.checkpoint || a.txDigest.localeCompare(b.txDigest) || a.cardObjectId.localeCompare(b.cardObjectId));
  const communities = groupCommunities(cards,
    priorManifest?.communityPaletteVersion === COMMUNITY_PALETTE_VERSION ? priorManifest.communities : []);
  const byMonth = new Map();
  for (const card of cards) {
    const month = card.timestamp.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Invalid card timestamp: ${card.cardObjectId}`);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(card);
  }
  const shards = [];
  for (const [month, batch] of [...byMonth].sort(([a], [b]) => a.localeCompare(b))) {
    const contents = json(batch);
    const hash = sha256(contents);
    const shardPath = `data/cards/${month}-${hash.slice(0, 12)}.json`;
    await atomicWrite(path.join(PUBLIC_DIR, shardPath), contents);
    shards.push({ path: shardPath, count: batch.length, sha256: hash });
  }
  const now = new Date().toISOString();
  const mergedRanges = mergeRanges(scannedRanges);
  const status = coverage({ firstRequiredCheckpoint, targetCheckpoint, scannedRanges: mergedRanges, candidates, originVerified });
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    network: 'mainnet',
    registryId: REGISTRY_ID,
    generatedAt: now,
    lastSyncedAt: now,
    firstRequiredCheckpoint,
    firstRequiredCheckpointVerified: originVerified,
    originTransactionSeen,
    lastContiguousCheckpoint: status.lastContiguousCheckpoint,
    lastScannedCheckpoint: Math.max(0, ...mergedRanges.map(([, end]) => end)),
    completeHistory: status.completeHistory,
    coverageGaps: status.coverageGaps,
    scannedRanges: mergedRanges,
    unclassifiedCount: candidates.length,
    totalCards: cards.length,
    totalCommunities: communities.length,
    communityPaletteVersion: COMMUNITY_PALETTE_VERSION,
    communities,
    shards,
  };
  // The manifest is the commit point. Its shard hashes let readers detect an interrupted update.
  await atomicWrite(CANDIDATES, json(candidates));
  await atomicWrite(MANIFEST, json(manifest));
  const active = new Set(shards.map((shard) => shard.path));
  for (const old of priorManifest?.shards ?? []) {
    if (!/^data\/cards\/[0-9]{4}-[0-9]{2}-[a-f0-9]{12}\.json$/.test(old.path) || active.has(old.path)) continue;
    try { await unlink(path.join(PUBLIC_DIR, old.path)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return manifest;
}
