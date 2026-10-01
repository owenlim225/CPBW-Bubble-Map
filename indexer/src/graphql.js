import { DEFAULT_ENDPOINT, REGISTRY_ID } from './constants.js';

const RANGE_QUERY = `query Range($registry: SuiAddress!) {
  serviceConfig {
    availableRange(type: "Query", field: "transactions", filters: ["affectedObject", "afterCheckpoint", "beforeCheckpoint"]) {
      first { sequenceNumber }
      last { sequenceNumber }
    }
  }
  checkpoint { sequenceNumber }
  object(address: $registry, version: 1) {
    previousTransaction { digest effects { checkpoint { sequenceNumber } } }
  }
}`;

const CANDIDATES_QUERY = `query Candidates($registry: SuiAddress!, $afterCheckpoint: UInt53, $beforeCheckpoint: UInt53, $after: String, $first: Int!) {
  transactions(first: $first, after: $after, filter: {
    affectedObject: $registry,
    afterCheckpoint: $afterCheckpoint,
    beforeCheckpoint: $beforeCheckpoint
  }) {
    pageInfo { hasNextPage endCursor }
    nodes { digest effects { checkpoint { sequenceNumber } } }
  }
}`;

const DETAIL_QUERY = `query Detail($digest: String!) {
  transaction(digest: $digest) {
    digest
    sender { address }
    kind {
      __typename
      ... on ProgrammableTransaction {
        inputs(first: 50) {
          pageInfo { hasNextPage }
          nodes {
            __typename
            ... on SharedInput { address mutable }
          }
        }
        commands(first: 50) {
          pageInfo { hasNextPage }
          nodes {
            __typename
            ... on MoveCallCommand {
              function { fullyQualifiedName }
              arguments {
                __typename
                ... on Input { ix }
              }
            }
          }
        }
      }
    }
    effects {
      status
      timestamp
      checkpoint { sequenceNumber }
      objectChanges(first: 50) {
        pageInfo { hasNextPage }
        nodes {
          address idCreated
          inputState { address }
          outputState {
            asMoveObject { contents { type { repr } json } }
          }
        }
      }
    }
  }
}`;

export class SuiGraphql {
  constructor({ endpoint = process.env.SUI_GRAPHQL_URL || DEFAULT_ENDPOINT, fetchImpl = fetch } = {}) {
    this.endpoint = endpoint || DEFAULT_ENDPOINT;
    this.fetchImpl = fetchImpl;
  }

  async request(query, variables = {}) {
    let lastError;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const headers = { 'content-type': 'application/json' };
        if (process.env.SUI_GRAPHQL_AUTH_HEADER && process.env.SUI_GRAPHQL_AUTH_VALUE) {
          headers[process.env.SUI_GRAPHQL_AUTH_HEADER] = process.env.SUI_GRAPHQL_AUTH_VALUE;
        }
        const response = await this.fetchImpl(this.endpoint, {
          method: 'POST', headers, body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`GraphQL HTTP ${response.status}: ${body.slice(0, 500)}`);
        }
        const body = await response.json();
        if (body.errors?.length) throw new Error(`GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
        if (!body.data) throw new Error('GraphQL returned no data');
        return body.data;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  async range() {
    const result = await this.request(RANGE_QUERY, { registry: REGISTRY_ID });
    const first = Number(result.serviceConfig?.availableRange?.first?.sequenceNumber);
    const last = Number(result.serviceConfig?.availableRange?.last?.sequenceNumber);
    const latest = Number(result.checkpoint?.sequenceNumber);
    const createdAt = result.object?.previousTransaction?.effects?.checkpoint?.sequenceNumber;
    if (![first, last, latest].every(Number.isSafeInteger)) throw new Error('Invalid provider range');
    return { first, last, latest, registryCreatedAt: createdAt == null ? null : Number(createdAt),
      registryCreationDigest: result.object?.previousTransaction?.digest ?? null };
  }

  async *candidates({ from, to, pageSize = 20, unbounded = false }) {
    let after = null;
    const seen = new Set();
    do {
      const result = await this.request(CANDIDATES_QUERY, {
        registry: REGISTRY_ID,
        afterCheckpoint: unbounded ? null : (from > 0 ? from - 1 : null),
        beforeCheckpoint: unbounded ? null : to + 1,
        after, first: pageSize,
      });
      const connection = result.transactions;
      if (!connection?.pageInfo || !Array.isArray(connection.nodes)) throw new Error('Invalid transactions page');
      for (const item of connection.nodes) {
        if (!item?.digest || !Number.isSafeInteger(Number(item.effects?.checkpoint?.sequenceNumber))) {
          throw new Error('Transaction page lacks digest or checkpoint');
        }
        const checkpoint = Number(item.effects.checkpoint.sequenceNumber);
        if (!unbounded && (checkpoint < from || checkpoint > to)) throw new Error('Provider returned transaction outside requested checkpoint range');
        if (seen.has(item.digest)) throw new Error(`Duplicate transaction digest in pagination: ${item.digest}`);
        seen.add(item.digest);
        if (checkpoint >= from && checkpoint <= to) yield { digest: item.digest, checkpoint };
      }
      if (!connection.pageInfo.hasNextPage) break;
      if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after) throw new Error('Pagination did not advance');
      after = connection.pageInfo.endCursor;
    } while (true);
  }

  async transaction(digest) {
    const result = await this.request(DETAIL_QUERY, { digest });
    if (!result.transaction) throw new Error(`Transaction ${digest} unavailable`);
    return result.transaction;
  }
}
