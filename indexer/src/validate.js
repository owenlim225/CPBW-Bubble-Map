import { loadSnapshot } from './snapshot.js';
import { REGISTRY_ID, SCHEMA_VERSION } from './constants.js';
import { coverage, mergeRanges } from './snapshot.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function validateSnapshot() {
  const { manifest, cards, candidates } = await loadSnapshot();
  if (!manifest) throw new Error('No snapshot manifest');
  if (manifest.schemaVersion !== SCHEMA_VERSION || manifest.network !== 'mainnet' || manifest.registryId !== REGISTRY_ID) {
    throw new Error('Manifest schema, network, or registry mismatch');
  }
  if (manifest.totalCards !== cards.length || manifest.unclassifiedCount !== candidates.length) {
    throw new Error('Manifest card or candidate count mismatch');
  }
  const ids = new Set();
  const groupCounts = new Map();
  for (const card of cards) {
    if (ids.has(card.cardObjectId)) throw new Error(`Duplicate card: ${card.cardObjectId}`);
    ids.add(card.cardObjectId);
    if (!Number.isSafeInteger(card.checkpoint) || !card.txDigest || !card.builderName || !card.packageId || !card.objectType) {
      throw new Error(`Invalid card fields: ${card.cardObjectId}`);
    }
    groupCounts.set(card.communityKey, (groupCounts.get(card.communityKey) ?? 0) + 1);
  }
  if (manifest.totalCommunities !== manifest.communities.length || groupCounts.size !== manifest.totalCommunities) {
    throw new Error('Community count mismatch');
  }
  for (const community of manifest.communities) {
    if (groupCounts.get(community.key) !== community.count || !community.label || !community.color) {
      throw new Error(`Invalid community: ${community.key}`);
    }
  }
  const target = Math.max(manifest.lastScannedCheckpoint ?? 0,
    ...manifest.coverageGaps.filter((gap) => gap.toCheckpoint != null).map((gap) => gap.toCheckpoint));
  const recalculated = coverage({ firstRequiredCheckpoint: manifest.firstRequiredCheckpoint,
    targetCheckpoint: target, scannedRanges: manifest.scannedRanges,
    candidates, originVerified: manifest.firstRequiredCheckpointVerified });
  if (recalculated.completeHistory !== manifest.completeHistory ||
    recalculated.lastContiguousCheckpoint !== manifest.lastContiguousCheckpoint ||
    JSON.stringify(recalculated.coverageGaps) !== JSON.stringify(manifest.coverageGaps)) {
    throw new Error('Coverage report mismatch');
  }
  if (JSON.stringify(mergeRanges(manifest.scannedRanges)) !== JSON.stringify(manifest.scannedRanges)) {
    throw new Error('Scanned ranges are not normalized');
  }
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  validateSnapshot().then((manifest) => console.log(`Validated ${manifest.totalCards} cards; completeHistory=${manifest.completeHistory}`))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
