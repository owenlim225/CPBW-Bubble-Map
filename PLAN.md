# Cryptita Plays Builder Workshop Bubble Map — Product and Delivery Plan

**Status:** First release implemented locally and validated against Sui Mainnet, 2 October 2026. GitHub publication awaits repository authentication and Pages setup.
**Primary reference:** The supplied “Cryptita Plays — Builder Workshop: Project Context” text. This repository is a separate map project; the workshop's Move and web source described in that text is not present here.

## Implementation record

The read-only collector in `indexer/` paginated registry-affected transactions, verified successful creation commands and created BuilderCard objects, and produced the first integrity-checked snapshot in `web/public/data/`. The snapshot contains **42 cards, 9 automatically identified communities, and no unresolved candidates**. Its manifest reports complete history from verified registry creation checkpoint **313656344** through checkpoint **329156761**. The React/Canvas site in `web/` provides the map, list, filters, selection, and replay. See [chain validation](docs/CHAIN_VALIDATION.md) and [operations](docs/OPERATIONS.md) for evidence and publication steps. The first release uses a dependency-free Node.js collector and deterministic Canvas layout instead of TypeScript and `d3-force`; these choices keep the small observed dataset simple.

## 1. Goal and scope

Build a public, read-only, two-dimensional animated map of **successful `create_builder_card` creations** that used the Cryptita Plays Mainnet shared Builder Registry:

`0x297cb610c0c47edc1e12008812f28cd8a1f35f95bb406d45f4b76fa9fda2e04c`

The map helps visitors discover the builders, see the chronology of card creation, and distinguish the communities that builders entered on their cards. The on-chain `community` string is self-declared metadata, not proof of membership. The map must accurately explain the relationship it depicts: each included card creation used the same registry. Proximity and colors express a visualization grouping, not transfers or other direct relationships between builders.

The first release includes **successful card creations only**. **Each created BuilderCard is one bubble.** New cards should appear automatically, but there is no minute- or second-level freshness requirement. Community grouping and colors are generated from the card's on-chain `community` field, with no official community list or paid classification service.

### In scope for the first release

- Mainnet historical backfill from the registry's first relevant transaction through the current indexed checkpoint.
- Continued read-only ingestion of newly successful card creations.
- A 2D map with stable community colors/clusters, subtle animation, zoom/pan, hover or tap detail, search, filters, and a chronological view.
- Clear source links to Sui transactions and BuilderCard objects, plus a visible last-synced status.
- Accessible list/table view of exactly the same records.
- Responsive layout, reduced-motion mode, and graceful loading/error/empty states.

### Outside the first release

- Wallet connection, transaction signing, card creation or editing, and changes to the workshop Move package or existing card site.
- Claims that two builder wallets transacted with each other, unless a separate verified relationship is added later.
- Automated identity or community-membership verification.
- Rendering the card's `about` field or loading remote profile photos by default; the supplied project context intentionally leaves `about` off the card, and `photo_url` points to a builder-controlled site.
- Cross-network aggregation. The supplied registry ID is the Mainnet registry; Testnet requires a distinct dataset and visible network switch if later requested.

## 2. Terms and source-of-truth rules

| Term | Meaning in this map |
| --- | --- |
| Registry object ID | The shared object above, passed as the mutable first argument to `create_builder_card`. It is the discovery anchor. |
| Package ID | A participant's published Move package. Multiple packages can implement `builder_card::builder_card::create_builder_card`; the registry ID is not a package ID. |
| Transaction digest | The unique Sui transaction in which one or more card creations occurred. |
| BuilderCard object ID | The unique created card and bubble identity. |
| `builder_no` | Workshop-wide number allocated by the registry; never inferred from sorting or manually assigned by this map. |
| `community` | String stored in the created card. Used to assign a display group after conservative normalization. |

The supplied context says the function mutates the registry by claiming a number, creates an owned `BuilderCard`, and transfers it to the sender. An affected-registry transaction is therefore a **candidate**, not automatically a card creation. The filter must confirm the successful call and its created object. One transaction can contain multiple commands, so do not assume one transaction equals one bubble.

## 3. User experience

1. **Overview:** Show total cards and communities, data coverage (“complete through checkpoint …”), last update time, the color legend, and a short note that community is self-declared.
2. **Map:** Put the registry at the center as a labeled reference point. Arrange BuilderCard bubbles into community neighborhoods. Use a deterministic layout so a refresh does not reshuffle everyone. Default to equal bubble radii; varying size without a metric would imply an unsupported value or importance. Bubble motion should be gentle and pause when idle or when reduced motion is requested.
3. **Connections:** On selection, highlight the selected card's link to the registry and its community grouping. Avoid a permanent forest of overlapping lines. A line means “this card was created using the registry,” not a payment or a social tie.
4. **Details:** Show builder name, `builder_no`, raw community label, profession/focus where available, creation time, transaction digest, card object ID, package ID, and the on-chain/source links. If a website link is shown, label it as a builder-provided external link.
5. **Explore:** Search by name, builder number, card ID, and community; filter by community and creation period; offer a chronological replay that adds bubbles in transaction order. Keep a count of visible versus total cards.
6. **Accessible alternative:** Supply a keyboard-operable list/table with the same filters and details. Do not require color, motion, hover, or a precise pointer to understand the data.
7. **Status states:** Distinguish no cards, loading, temporary sync lag, provider error, and incomplete historical coverage. Never show “all builders” when the backfill is incomplete.

### Visual behavior

- Automatic, stable color from a normalized community key, with names/patterns so color is not the only identifier. All cards in one community share a color; distinct communities receive different colors while the palette permits clear separation.
- Cluster labels and an “Unknown / unlisted” group for blank or unusable values.
- Subtle buoyancy and collision avoidance, bounded so cards remain selectable.
- A replay timeline that changes which records are visible while preserving their layout positions.
- Zoom-to-fit, reset view, selection state, and sensible touch targets on mobile.
- Aggregate or simplify rendering at large counts; retain full data in the list and detail view.

## 4. Data discovery and verification

The indexer should follow this pipeline:

```text
Sui Mainnet GraphQL / historical provider
    → paginate transactions affecting the registry
    → confirm successful execution and the create_builder_card Move call
    → inspect created object changes for BuilderCard objects
    → extract creation-time card fields, sender, digest, checkpoint and timestamp
    → validate and normalize community; merge by card object ID
    → write versioned static data files and a coverage manifest
    → render map and list
```

### Inclusion rule

Include a record only when all checks pass:

1. The transaction belongs to **Mainnet** and affected the exact registry object ID.
2. Transaction effects report success.
3. A programmable-transaction command calls `create_builder_card` in a `builder_card::builder_card` implementation, with the registry object as its actual argument. Verify the call and argument mapping against the current chain schema and a real transaction during the discovery spike; an affected-object filter or matching function name alone is insufficient.
4. Its effects contain a **newly created** object with the expected `::builder_card::BuilderCard` type and readable creation-time fields. Record every matching new card if a transaction created more than one.
5. The source object type/package and transaction evidence are retained for audit. Do not impose a static package allow-list: workshop participants publish separate packages, so new valid packages must be discoverable automatically. Quarantine ambiguous lookalike types or schema mismatches for review rather than silently accepting them.

If a transaction cannot be classified confidently, store it in an investigation queue and show it in sync diagnostics, not as a bubble. Failed calls and unrelated registry operations are excluded. Card transfers after creation do not create new bubbles. Creation-time fields should remain stable in the map even if ownership or another readable state changes later; a future “current owner” feature would be a separate read with its own timestamp.

### Historical coverage

Before backfill, query the provider's available range for registry-affected transaction filtering and find the registry creation or first relevant checkpoint. Paginate the whole available interval. GraphQL history is subject to provider retention, so an ordinary endpoint may not reach the beginning. If there is a gap, use an archival-capable provider or checkpoint-based backfill before claiming full coverage. Store contiguous checkpoint coverage and the last committed checkpoint independently of any short-lived GraphQL cursor. Re-read a small overlapping interval on each scheduled run; unique keys make retries safe. Check the actual provider's query limits and pagination behavior during implementation.

## 5. Proposed system design

| Part | Recommendation | Reason / tradeoff |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite | Matches the workshop site's familiar stack while keeping this map a separate app. This repository currently has no frontend code. |
| Rendering | Canvas 2D for bubbles; normal HTML for controls, details, and list | Keeps animation responsive without making the data inaccessible. The first release uses a deterministic layout; a force simulation or aggregation can be added if data volume requires it. |
| Indexer | One Node.js command for initial backfill and scheduled catch-up | One classifier and one source of truth; no always-on server. A custom checkpoint indexer is a later option if query limits or volume demand it. |
| Storage | Versioned JSON snapshot in this repository, sharded by creation month or checkpoint range, plus a manifest | The expected workshop-scale dataset does not yet justify a database. Git history preserves revisions; sharding avoids rewriting a huge file on every update. Reassess after measuring the real count. |
| Public interface | Static data files served with the site | Browsers do not query Sui directly or need an API key. The browser checks the manifest periodically so an open tab can pick up a newer snapshot. |
| Hosting | GitHub Pages plus a scheduled GitHub Actions job as the free-first option | Appropriate for updates measured in hours or days, subject to GitHub's schedule delay, dropped-run, and inactivity rules. A more reliable hosted scheduler can replace it later without changing the map data contract. |

Do not put a privileged provider key or ingestion credential in browser code or the snapshot. No authentication is needed for public exploration. The frontend never submits Sui transactions. A static deployment also keeps hosting and operating cost low, but complete historical backfill still depends on an available data source.

### Minimal snapshot data

`data/cards/*.json`: unique `card_object_id`, `tx_digest`, checkpoint, chain timestamp, sender, package ID, object type, `builder_no`, builder name, raw and normalized community, selected public card fields, optional website URL, and parser version. Sort by checkpoint, transaction order, then card ID. A generator rejects duplicate IDs before publication.

`data/manifest.json`: network and registry ID, schema version, generated time, total card/community counts, first required and last contiguous committed checkpoints, complete-history flag, coverage gaps, last successful sync, and shard names/hashes. The UI reads this before loading cards.

`data/candidates.json`: digests and reasons for registry-affected transactions that could not be classified confidently. This is diagnostic data, never displayed as confirmed cards.

The worker writes validated files atomically, checks schema and duplicates, then publishes the snapshot. Re-running the same range produces the same card set. A database and paginated API become justified only if the actual count or snapshot size makes static loading slow.

### Community handling

Grouping is automatic from the card's `community` string. Normalize Unicode consistently, trim and collapse whitespace, case-fold, and standardize simple separators so obvious formatting variants such as `Base-Build` and `base build` share a key. Preserve the exact raw string and choose a human-facing label from the most common spelling. Treat blank values as “Unknown / unlisted.” Do **not** automatically merge different names such as `Base Build` and `Base Builders`: the chain field is free-form, and similarity alone is not proof they are the same community. The map may show those as separate groups, with their raw labels visible. No official list, manual alias table, AI service, or paid classifier is required.

Allocate a stable color to each new normalized key and persist that mapping in the manifest. Prefer maximally separated hues/patterns among the known groups; keep text labels because an unbounded number of communities cannot all have perfectly distinct accessible colors. A card may contain only one free-form `community` string under the supplied Move contract, so multi-community membership cannot be inferred. Recompute group counts when the snapshot changes.

## 6. Snapshot and update behavior

- The batch command accepts a configured Mainnet source, registry ID, checkpoint range, and existing manifest. Initial backfill and routine updates use the same validation rules.
- A daily scheduled run at an off-hour checks for new registry-affected transactions, re-reads an overlap, merges by card ID, regenerates communities/colors/counts, validates the snapshot, and deploys it only after success. A manual run is available for recovery.
- The frontend loads the manifest and required shards on page load, and checks the manifest again periodically while the tab stays open. Search and filtering operate on the local verified snapshot.
- Show `Last indexed` and `Complete history: yes/no` in the UI. A delayed scheduled job means stale data, not an empty map; a missed run is caught by a later checkpoint-range scan.

There is **no strict freshness service-level promise**. The target is eventual automatic appearance after the next successful scheduled run, potentially hours later. If the GitHub schedule is disabled or repeatedly missed, the UI must show the stale last-sync time and an operator must re-enable or replace the scheduler. If the project later needs guaranteed unattended updates, move the same batch command to a monitored hosted scheduler; the static snapshot format can stay.

## 7. Reliability, safety, and operations

- **Completeness:** The source of truth is the committed chain, not a counter on the current registry object. Registry count is only a sanity check because unrelated operations or future contract changes may affect it.
- **Recovery:** Publish card shards and the manifest only after the whole run validates. Retry transient RPC failures with backoff; overlap scans and card-ID deduplication prevent missed or duplicate records after restarts. A failed run leaves the previous valid snapshot online.
- **Observability:** Track last successful run, unclassified candidate transactions, backfill coverage, parser failures, provider rate limits, and bubble count by community. Surface a stale-data warning on the site; a maintainer should check workflow status periodically because a free scheduled workflow is not an always-on monitoring service.
- **Data integrity:** Save transaction digest and card ID so every bubble can be checked on a block explorer. Do not infer sender from current owner. Sanitize/validate external URLs and render all chain strings as untrusted text; never inject them as HTML.
- **Privacy:** All card fields are public on-chain, but make that visible to visitors. Use only fields needed for discovery. Skip remote photo fetching by default because the URL is controlled by each builder and can track visitors.
- **Accessibility:** Keyboard navigation, readable contrast, labels alongside colors, focusable details, reduced motion, and the list alternative are release requirements.
- **Cost:** Chain reads do not require SUI gas. Try the public Sui GraphQL service and free static hosting first, but measure the Mainnet candidate volume, historical coverage, and provider limits before claiming the entire system can stay free. A paid archival/data provider may be needed if the free endpoint has pruned the earliest transactions; a paid scheduler is optional if free scheduling proves unreliable.

### Cost expectation

| Item | Free-first route | When payment might be needed |
| --- | --- | --- |
| Reading card/transaction data | Query Sui's public GraphQL endpoint in a batch job. No wallet, SUI gas, or blockchain-scanner subscription is required just to read. | A provider may charge for higher request volume, service guarantees, or archival history no longer queryable through the public endpoint. |
| Initial full-history backfill | Attempt the public available range and verify it includes the first relevant registry checkpoint. | If the oldest transactions have been pruned from that query service, use an archival-capable source; its access terms must be checked. |
| Website and scheduled updates | For a **public** repository, GitHub Pages and standard GitHub-hosted Actions runners can be used without an Actions/Pages usage charge under their published terms. | Private-repository limits, another host, a custom domain, or a more reliable scheduler may introduce charges. |

The map should query Sui data APIs, not scrape the HTML of a blockchain explorer. Explorer links are for visitors to verify individual cards and transactions. **A $0 deployment is plausible, but cannot be guaranteed until Phase 0 proves that a free source covers the full history and the expected query volume.**

## 8. Implementation phases and exit criteria

### Phase 0 — Chain and product discovery

1. Obtain or inspect the current workshop Move source and a few real Mainnet create transactions.
2. Verify the registry's on-chain type, function signature, package patterns, created object types, fields, and how a multi-command transaction appears in the chosen API.
3. Measure candidate count, first/last checkpoints, provider historical range, and likely growth rate.
4. Confirm the snapshot size is practical for a static site and decide whether builder-provided website links should appear in details. The bubble identity, automatic community rule, and relaxed freshness requirement are already settled.

**Exit:** A documented inclusion query/parser contract; at least three verified positive examples and negative examples; a proven path to complete historical coverage.

### Phase 1 — Data foundation

1. Add the snapshot schema, GraphQL/provider client, strict candidate classifier, and repeatable backfill command.
2. Backfill from the first required checkpoint. Record gaps and unclassified transactions.
3. Cross-check a sample across early, middle, and recent history against transaction effects and explorer pages. Compare the resulting card count to independent evidence where possible.

**Exit:** No known coverage gap, duplicate card IDs, or unclassified successful card creation in sampled intervals; provenance fields present for every record.

### Phase 2 — Map and exploration

1. Build a responsive map shell and a real-data-backed list with shared search/filter state.
2. Add stable community clustering, animation, selection detail, zoom/pan, chronological replay, and source links.
3. Add accessible controls, reduced-motion behavior, legends, loading/error/empty states, and a visible coverage indicator.

**Exit:** Every included record is findable by search/list and selectable in the map; colors and positions do not misstate relationships; mobile and keyboard use work.

### Phase 3 — Incremental sync and launch

1. Deploy the static site and snapshot generation workflow with environment-specific configuration.
2. Run catch-up from the backfill checkpoint, verify idempotency and restart recovery, then expose the public map.
3. Add a runbook for gaps, provider failures, missed/disabled scheduled jobs, and unusual community variants.

**Exit:** New confirmed creations appear after a successful scheduled run; an outage does not lose cards; the UI reports stale or incomplete data truthfully.

## 9. Verification plan

- Parser fixtures from **real** successful transactions, failed registry calls, unrelated registry calls, malformed fields, transfer-only transactions, and a multi-command transaction if one exists.
- Re-run the same backfill range twice and confirm identical card counts and values.
- Force a worker failure before snapshot publication; confirm the previous snapshot remains valid and the next run catches up without loss or duplication.
- Check first/last checkpoint coverage and investigate gaps before claiming “all.”
- Compare sampled card IDs, `builder_no`, community values, sender, and timestamps to the creation transaction's effects.
- Test search, filters, selection, source links, keyboard-only navigation, touch use, narrow/wide layouts, and `prefers-reduced-motion`.
- Measure map performance at observed size and synthetic 2×/5× size. If animation slows, cap active simulation and render simplified clusters while keeping all records accessible in the list.
- Check snapshot schema and hashes, XSS-resistant text rendering, safe external links, and that no secret is included in the frontend bundle or static files.

## 10. Key risks and decisions

| Risk | Response |
| --- | --- |
| Historical GraphQL range does not reach the first card | Use an archival-capable source or checkpoint backfill; do not mark dataset complete before the gap is closed. |
| Many participant package IDs | Discover through registry-affected transactions; verify actual calls and created types by a consistent rule that accepts new valid packages automatically. |
| Free-form community spelling produces fragmented clusters | Group obvious formatting variants automatically and keep other names separate unless chain data gives stronger evidence. Show raw labels. |
| Public endpoint throttles or changes retention | Keep validated snapshots in the repository, retry later, and choose an archival/production provider only when discovery shows it is needed. |
| GitHub scheduled job is delayed, dropped, or disabled after inactivity | Show last-indexed time, retain a manual run, inspect job status, and move to a monitored scheduler if unattended reliability becomes a requirement. |
| Large bubble count makes animation unreadable | Aggregate at low zoom, use Canvas rendering and bounded simulation, and always retain the searchable list. |
| Remote website/photo content is unsafe or unavailable | Treat links as external untrusted data; do not depend on them for core map rendering. |
| Users misread visual edges as transfers or social ties | Label the registry relationship plainly and only draw verified edges. |

## 11. Technical sources checked for this plan

- [Sui data-access guidance](https://docs.sui.io/develop/accessing-data/) distinguishes GraphQL, gRPC, custom indexing, and archival history.
- [Sui GraphQL querying guide](https://docs.sui.io/develop/accessing-data/graphql/query-with-graphql) documents affected-object and function filters, object changes, pagination, retention, and public endpoint rate limits.
- [Sui object model](https://docs.sui.io/develop/sui-architecture/object-model) explains shared objects and object/transaction relationships.
- [D3 force documentation](https://d3js.org/d3-force) supports force-driven bubble layout rendered in Canvas or SVG.
- [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage) says standard hosted runners are free for public repositories; [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) is available to public repositories on GitHub Free.
- [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) warns that runs can be delayed/dropped and public-repository schedules may be disabled after 60 days without activity.

## 12. Builder-provided website links

The implemented details panel shows an optional builder-provided website link when the on-chain value is a valid HTTP(S) URL. It is clearly labeled as external and does not affect chain discovery or community grouping.

**Remaining launch action:** Authenticate to the GitHub repository, push this implementation, select GitHub Actions as the Pages source, and run the publication workflow. Verify the public site and workflow history after deployment.
