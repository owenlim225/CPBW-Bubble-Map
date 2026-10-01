import { REGISTRY_ID, sameAddress } from './constants.js';

const CARD_TYPE = /^(0x[0-9a-fA-F]+)::builder_card::BuilderCard$/;
const CREATE_FUNCTION = /^(0x[0-9a-fA-F]+)::builder_card::create_builder_card$/;

function finiteCheckpoint(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function safeWebsite(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

export function classifyTransaction(tx) {
  const digest = tx?.digest;
  const effects = tx?.effects;
  const checkpoint = finiteCheckpoint(effects?.checkpoint?.sequenceNumber);
  const diagnostic = (reason) => ({ status: 'quarantine', digest, checkpoint, reason, cards: [] });
  const excluded = (reason) => ({ status: 'excluded', digest, checkpoint, reason, cards: [] });
  if (!digest || checkpoint === null || !effects) return diagnostic('Missing transaction identity, checkpoint, or effects');
  if (effects.status === 'FAILURE') return excluded('Transaction failed');
  if (effects.status !== 'SUCCESS') return diagnostic('Unknown execution status');
  if (tx.kind?.__typename !== 'ProgrammableTransaction') return excluded('Not a programmable transaction');

  const inputs = tx.kind.inputs;
  const commands = tx.kind.commands;
  const changes = effects.objectChanges;
  if (!inputs || !commands || !changes || !Array.isArray(inputs.nodes) || !Array.isArray(commands.nodes) || !Array.isArray(changes.nodes)) {
    return diagnostic('Missing input, command, or object-change connection');
  }
  if (inputs.pageInfo?.hasNextPage || commands.pageInfo?.hasNextPage || changes.pageInfo?.hasNextPage) {
    return diagnostic('Input, command, or object-change pagination incomplete');
  }
  const calls = commands.nodes.filter((command) => CREATE_FUNCTION.test(command?.function?.fullyQualifiedName ?? ''));
  const createdCardChanges = changes.nodes.filter((change) => change?.idCreated === true &&
    CARD_TYPE.test(change?.outputState?.asMoveObject?.contents?.type?.repr ?? ''));
  if (!calls.length && !createdCardChanges.length) return excluded('No card creation command or created card');

  const validCalls = [];
  for (const command of calls) {
    const firstArg = command.arguments?.[0];
    const input = firstArg?.__typename === 'Input' ? inputs.nodes[firstArg.ix] : null;
    if (input?.__typename === 'SharedInput' && input.mutable === true && sameAddress(input.address, REGISTRY_ID)) {
      validCalls.push(command);
    }
  }
  if (!validCalls.length) {
    return createdCardChanges.length ? diagnostic('Created BuilderCard without verified registry-first call')
      : excluded('Create call did not pass the target registry as its first argument');
  }
  if (!createdCardChanges.length) return diagnostic('Verified create call has no new BuilderCard output');
  if (createdCardChanges.length !== validCalls.length) return diagnostic('Create command and new BuilderCard counts disagree');

  const callCounts = new Map();
  for (const command of validCalls) {
    const packageId = command.function.fullyQualifiedName.match(CREATE_FUNCTION)[1].toLowerCase();
    callCounts.set(packageId, (callCounts.get(packageId) ?? 0) + 1);
  }
  const cards = [];
  for (const change of createdCardChanges) {
    const type = change.outputState.asMoveObject.contents.type.repr;
    const packageId = type.match(CARD_TYPE)[1].toLowerCase();
    const count = callCounts.get(packageId) ?? 0;
    if (!count) return diagnostic('New BuilderCard package does not match a verified create call');
    callCounts.set(packageId, count - 1);
    if (change.inputState !== null) return diagnostic('BuilderCard had an input state; not a new object');
    const fields = change.outputState.asMoveObject.contents.json;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return diagnostic('Created card fields unavailable');
    const builderNo = String(fields.builder_no ?? '');
    const sender = tx.sender?.address;
    const timestamp = effects.timestamp;
    if (!/^\d+$/.test(builderNo) || !text(fields.builder_name).trim() || !sender ||
      !timestamp || Number.isNaN(Date.parse(timestamp)) || !change.address) {
      return diagnostic('Created card required fields invalid');
    }
    cards.push({
      cardObjectId: change.address,
      txDigest: digest,
      checkpoint,
      timestamp,
      sender,
      packageId,
      objectType: type,
      builderNo,
      builderName: text(fields.builder_name),
      communityRaw: text(fields.community),
      communityKey: '',
      communityLabel: '',
      profession: text(fields.profession),
      focus: text(fields.focus),
      country: text(fields.country),
      websiteUrl: safeWebsite(fields.website_url),
    });
  }
  if ([...callCounts.values()].some((count) => count !== 0)) return diagnostic('Create call has no matching card type');
  return { status: 'included', digest, checkpoint, cards };
}
