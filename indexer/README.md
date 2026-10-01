# BuilderCard data collector

This read-only Node.js command creates the static Mainnet snapshot used by the bubble map. It never signs or submits a Sui transaction.

## Run

```sh
cd indexer
npm ci
npm test
npm run sync
npm run validate
```

`npm run sync` reads the exact shared registry, verifies each candidate's successful `builder_card::create_builder_card` command and registry-first argument, and includes only new matching `BuilderCard` objects. It writes `web/public/data/manifest.json`, content-hashed monthly card shards, and `web/public/data/candidates.json` for transactions needing investigation.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `SUI_GRAPHQL_URL` | Mainnet GraphQL endpoint; defaults to Sui's public endpoint. |
| `SUI_GRAPHQL_AUTH_HEADER` and `SUI_GRAPHQL_AUTH_VALUE` | Header and value for a private provider, used only in the collector. |
| `FIRST_REQUIRED_CHECKPOINT` | Expected registry creation checkpoint. The collector independently checks it against registry version 1. |
| `SYNC_FROM_CHECKPOINT` and `SYNC_TO_CHECKPOINT` | Explicit inclusive range for manual backfill. |
| `SYNC_OVERLAP_CHECKPOINTS` | Checkpoints to re-read on ordinary updates; default 1000. |
| `SYNC_PAGE_SIZE` | Candidate page size, 1–50; default 20. |

Empty environment values use the defaults. The current registry creation checkpoint is 313656344. The collector stores scanned checkpoint ranges, requires the registry creation digest to appear in the paginated history before it calls the origin verified, and reports missing ranges or unclassified candidates in the manifest. A long outage that crosses the provider's reported retention floor triggers an unbounded origin scan. Previously indexed transactions in a re-read range must still appear; otherwise the run fails and leaves the previous snapshot intact.

If the public GraphQL service cannot supply an older interval, `completeHistory` stays false until that interval is backfilled from a provider with sufficient history. Do not infer completeness from the registry's current counter alone.

The query fields and retention behavior follow Sui's [GraphQL query guide](https://docs.sui.io/develop/accessing-data/graphql/query-with-graphql) and [schema reference](https://docs.sui.io/references/sui-graphql). The public service is rate limited; a provider endpoint may be needed for larger backfills.
