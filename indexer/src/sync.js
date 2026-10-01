import { classifyTransaction } from './classify.js';
import { SuiGraphql } from './graphql.js';
import { loadSnapshot, saveSnapshot } from './snapshot.js';

function optionalInteger(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`);
  return value;
}

async function main() {
  const client = new SuiGraphql();
  const { manifest: previous, cards: oldCards, candidates: oldCandidates } = await loadSnapshot();
  if (previous && (previous.network !== 'mainnet' || previous.schemaVersion !== 1)) {
    throw new Error('Existing snapshot network or schema mismatch');
  }
  const range = await client.range();
  const configuredFirst = optionalInteger('FIRST_REQUIRED_CHECKPOINT', null);
  const firstRequiredCheckpoint = configuredFirst ?? previous?.firstRequiredCheckpoint ?? range.registryCreatedAt;
  const originMatches = Number.isSafeInteger(range.registryCreatedAt) && firstRequiredCheckpoint === range.registryCreatedAt;
  if (firstRequiredCheckpoint == null) throw new Error('Registry creation checkpoint unavailable; set FIRST_REQUIRED_CHECKPOINT after independent verification');
  const overlap = optionalInteger('SYNC_OVERLAP_CHECKPOINTS', 1000);
  const pageSize = optionalInteger('SYNC_PAGE_SIZE', 20);
  if (pageSize < 1 || pageSize > 50) throw new Error('SYNC_PAGE_SIZE must be 1–50');
  const explicitFrom = optionalInteger('SYNC_FROM_CHECKPOINT', null);
  const explicitTo = optionalInteger('SYNC_TO_CHECKPOINT', null);
  let from = explicitFrom ?? (previous?.lastScannedCheckpoint
    ? Math.max(firstRequiredCheckpoint, previous.lastScannedCheckpoint - overlap)
    : firstRequiredCheckpoint);
  const to = explicitTo ?? Math.min(range.latest, range.last);
  if (from < firstRequiredCheckpoint) from = firstRequiredCheckpoint;
  // When a long outage puts the overlap behind the provider's advertised
  // retention floor, restart from the verified origin with an unbounded query.
  // An unbounded scan only counts as complete if it actually sees the origin tx.
  if (explicitFrom == null && explicitTo == null && from < range.first && originMatches) {
    from = firstRequiredCheckpoint;
  }
  if (to < from) throw new Error(`Empty scan range: ${from}–${to}`);
  if (to > range.latest) throw new Error(`Requested end ${to} exceeds latest indexed checkpoint ${range.latest}`);

  // The public service may report a conservative availableRange.first while an
  // unbounded affectedObject query can still paginate older registry history.
  const unbounded = explicitTo == null && from === range.registryCreatedAt &&
    (explicitFrom == null || explicitFrom === range.registryCreatedAt);
  const cardById = new Map(oldCards.map((card) => [card.cardObjectId, card]));
  const candidateByDigest = new Map(oldCandidates.map((candidate) => [candidate.digest, candidate]));
  let scanned = 0;
  let included = 0;
  let excluded = 0;
  const seenDigests = new Set();
  let earliestSeen = Infinity;
  for await (const candidate of client.candidates({ from, to, pageSize, unbounded })) {
    const tx = await client.transaction(candidate.digest);
    const result = classifyTransaction(tx);
    if (result.checkpoint !== candidate.checkpoint) throw new Error(`Checkpoint mismatch for ${candidate.digest}`);
    scanned++;
    seenDigests.add(candidate.digest);
    earliestSeen = Math.min(earliestSeen, candidate.checkpoint);
    candidateByDigest.delete(candidate.digest);
    if (result.status === 'included') {
      for (const card of result.cards) {
        const old = cardById.get(card.cardObjectId);
        if (old && (old.txDigest !== card.txDigest || old.builderNo !== card.builderNo)) {
          throw new Error(`Conflicting BuilderCard identity: ${card.cardObjectId}`);
        }
        cardById.set(card.cardObjectId, card);
        included++;
      }
    } else if (result.status === 'quarantine') {
      candidateByDigest.set(candidate.digest, { digest: candidate.digest, checkpoint: candidate.checkpoint, reason: result.reason });
    } else excluded++;
  }
  const missingKnown = oldCards.find((card) => card.checkpoint >= from && card.checkpoint <= to &&
    !seenDigests.has(card.txDigest));
  if (missingKnown) throw new Error(`Provider omitted previously indexed transaction ${missingKnown.txDigest}; snapshot unchanged`);
  // A repeat scan replaces diagnostics from its covered interval, including
  // ones whose transactions are no longer returned. Such disappearance makes
  // the scan unsafe to publish, so retain any prior item in the interval.
  for (const candidate of oldCandidates) {
    if (candidate.checkpoint >= from && candidate.checkpoint <= to && !seenDigests.has(candidate.digest) && !candidateByDigest.has(candidate.digest)) {
      const stillSeen = [...cardById.values()].some((card) => card.txDigest === candidate.digest);
      if (!stillSeen) candidateByDigest.set(candidate.digest, candidate);
    }
  }
  const originTransactionSeen = Boolean(previous?.originTransactionSeen) ||
    Boolean(range.registryCreationDigest && seenDigests.has(range.registryCreationDigest));
  const originVerified = originMatches && originTransactionSeen;
  const scannedFrom = unbounded && !seenDigests.has(range.registryCreationDigest) ? earliestSeen : from;
  const next = await saveSnapshot({
    cards: [...cardById.values()],
    candidates: [...candidateByDigest.values()].sort((a, b) => a.checkpoint - b.checkpoint || a.digest.localeCompare(b.digest)),
    priorManifest: previous,
    firstRequiredCheckpoint,
    originVerified,
    scannedRanges: [...(previous?.scannedRanges ?? []), ...(Number.isFinite(scannedFrom) ? [[scannedFrom, to]] : [])],
    targetCheckpoint: range.latest,
    originTransactionSeen,
  });
  console.log(JSON.stringify({ from, to, scanned, included, excluded, quarantined: next.unclassifiedCount,
    totalCards: next.totalCards, completeHistory: next.completeHistory,
    lastContiguousCheckpoint: next.lastContiguousCheckpoint, availableRange: [range.first, range.last] }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
