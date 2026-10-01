# Mainnet chain validation

Read-only observations made on 2026-10-02 through `https://graphql.mainnet.sui.io/graphql`. These values are a starting fixture for the indexer, not a substitute for its full validation and sync status.

| Item | Observed value |
| --- | --- |
| Registry ID | `0x297cb610c0c47edc1e12008812f28cd8a1f35f95bb406d45f4b76fa9fda2e04c` |
| Registry type | `0x24c722f3ddac40d511ef390d052fe09a46a9949fdc8eca480780de99ec526114::builder_registry::BuilderRegistry` |
| Registry creation transaction | `BtvCEwjb5DEt6kYvxvNtzW8S15cUDnQQ7hnD3g4xHZc4` |
| Registry creation checkpoint | `313656344` |
| Registry creation time | `2026-08-22T14:27:23.756Z` |
| Registry version and `next_builder_no` when checked | `43` and `43` |
| Registry-affected transactions returned by a `first: 50` GraphQL query | `43`, with no previous or next page |

The first registry-affected transaction is the registry's creation; it is **not** a BuilderCard creation and is a useful negative classifier fixture. The current `next_builder_no` suggests 42 numbers have been assigned after creation, but the counter by itself does not prove the number of valid cards.

The first complete collector run classified the 43 candidates as 42 confirmed card creations and one registry creation. The 42 saved cards have distinct `builder_no` values spanning **1 through 42**, with no missing number; the candidate diagnostic queue is empty. This cross-check supports the snapshot's complete-history claim at checkpoint 329156761, subject to future provider behavior and new chain activity.

One confirmed positive fixture is transaction `9mHv5yeBiEjTf8hQyLj8bHWkb95WjAv9LghbpCwVmz8Z` at checkpoint `314254367` on `2026-08-24T03:22:57.301Z`. Its programmable transaction calls `0xad5d3257f45d1a2385bee22b059975f0833acf7f71370522f2fc996a69b14c24::builder_card::create_builder_card`; the first command argument points to input 0, a mutable shared input with the target registry ID. Effects report `SUCCESS` and include newly created `0x77e1b7d2d8accec3569856b5a9e7029cd9523b7bfde8f2fc7b5d88a425e7c092`, type `0xad5d3257f45d1a2385bee22b059975f0833acf7f71370522f2fc996a69b14c24::builder_card::BuilderCard`, `builder_no` 33, and `community` “Cryptita Plays”.

The public GraphQL `serviceConfig.availableRange` for `transactions` filtered by `affectedObject` reported a first checkpoint later than the registry's creation checkpoint, even though an unbounded affected-object query returned the creation transaction and all 43 candidates with both pagination flags false. The indexer must evaluate **actual pagination and the registry creation boundary** when setting `completeHistory`; it must not rely on that range metadata alone. Recheck these observations on every backfill because provider retention and chain state change.
