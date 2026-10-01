import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTransaction } from '../src/classify.js';
import { REGISTRY_ID } from '../src/constants.js';
import { normalizeCommunity, groupCommunities } from '../src/community.js';
import { coverage, mergeRanges } from '../src/snapshot.js';

const PACKAGE = '0xad5d3257f45d1a2385bee22b059975f0833acf7f71370522f2fc996a69b14c24';
const cardType = `${PACKAGE}::builder_card::BuilderCard`;
const command = (ix = 0) => ({ __typename: 'MoveCallCommand',
  function: { fullyQualifiedName: `${PACKAGE}::builder_card::create_builder_card` },
  arguments: [{ __typename: 'Input', ix }] });
const cardChange = (id = '0x77') => ({ address: id, idCreated: true, inputState: null,
  outputState: { asMoveObject: { contents: { type: { repr: cardType }, json: {
    builder_no: '18446744073709551615', builder_name: 'Builder', community: 'Base-Build',
    profession: 'Artist', focus: 'Move', country: 'PH', website_url: 'javascript:alert(1)',
  } } } } });
const fixture = () => ({ digest: 'testDigest', sender: { address: '0x12' },
  kind: { __typename: 'ProgrammableTransaction',
    inputs: { pageInfo: { hasNextPage: false }, nodes: [{ __typename: 'SharedInput', address: REGISTRY_ID, mutable: true }] },
    commands: { pageInfo: { hasNextPage: false }, nodes: [command()] } },
  effects: { status: 'SUCCESS', timestamp: '2026-08-24T03:22:57.301Z', checkpoint: { sequenceNumber: 314254367 },
    objectChanges: { pageInfo: { hasNextPage: false }, nodes: [cardChange()] } } });

test('includes only a successful registry-first call with a newly created matching card', () => {
  const result = classifyTransaction(fixture());
  assert.equal(result.status, 'included');
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].builderNo, '18446744073709551615');
  assert.equal(result.cards[0].websiteUrl, null);
  assert.equal(result.cards[0].packageId, PACKAGE);
});

test('rejects failed, wrong-registry, transfer-only, and incomplete evidence', () => {
  const failed = fixture(); failed.effects.status = 'FAILURE';
  assert.equal(classifyTransaction(failed).status, 'excluded');
  const wrong = fixture(); wrong.kind.inputs.nodes[0].address = '0x88';
  assert.notEqual(classifyTransaction(wrong).status, 'included');
  const transfer = fixture(); transfer.kind.commands.nodes = []; transfer.effects.objectChanges.nodes = [];
  assert.equal(classifyTransaction(transfer).status, 'excluded');
  const truncated = fixture(); truncated.effects.objectChanges.pageInfo.hasNextPage = true;
  assert.equal(classifyTransaction(truncated).status, 'quarantine');
  const noCreation = fixture(); noCreation.effects.objectChanges.nodes[0].idCreated = false;
  assert.equal(classifyTransaction(noCreation).status, 'quarantine');
});

test('one verified command creates one bubble, including multi-command transactions', () => {
  const tx = fixture();
  tx.kind.commands.nodes.push(command());
  tx.effects.objectChanges.nodes.push(cardChange('0x78'));
  assert.equal(classifyTransaction(tx).cards.length, 2);
  tx.effects.objectChanges.nodes.pop();
  assert.equal(classifyTransaction(tx).status, 'quarantine');
});

test('normalizes obvious formatting, preserves distinct names and stable colors', () => {
  assert.equal(normalizeCommunity(' Base-Build ').key, normalizeCommunity('base build').key);
  assert.notEqual(normalizeCommunity('Base Builders').key, normalizeCommunity('base build').key);
  assert.equal(normalizeCommunity('  ').key, 'unknown');
  const cards = [{ communityRaw: 'Base-Build' }, { communityRaw: 'base build' }, { communityRaw: 'Base Builders' }];
  const groups = groupCommunities(cards);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.key === 'base build').count, 2);
  assert.notEqual(groups[0].color, groups[1].color);
  assert.equal(groupCommunities(cards, groups).find((group) => group.key === 'base build').color,
    groups.find((group) => group.key === 'base build').color);
  const expanded = groupCommunities([...cards, { communityRaw: 'Another group' }], groups);
  assert.equal(expanded.find((group) => group.key === 'base build').color,
    groups.find((group) => group.key === 'base build').color);
  assert.equal(new Set(expanded.map((group) => group.color)).size, expanded.length);
});

test('coverage stays incomplete across gaps or unclassified transactions', () => {
  assert.deepEqual(mergeRanges([[5, 7], [1, 2], [3, 4]]), [[1, 7]]);
  const complete = coverage({ firstRequiredCheckpoint: 1, targetCheckpoint: 10,
    scannedRanges: [[1, 10]], candidates: [], originVerified: true });
  assert.equal(complete.completeHistory, true);
  const incomplete = coverage({ firstRequiredCheckpoint: 1, targetCheckpoint: 10,
    scannedRanges: [[1, 3], [5, 10]], candidates: [{ digest: 'x', checkpoint: 7 }], originVerified: true });
  assert.equal(incomplete.completeHistory, false);
  assert.equal(incomplete.lastContiguousCheckpoint, 3);
  assert.equal(incomplete.coverageGaps.length, 2);
});
