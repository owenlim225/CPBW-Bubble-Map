# Operating the BuilderCard bubble map

This site is a read-only view of successful Mainnet `create_builder_card` creations that used registry `0x297cb610c0c47edc1e12008812f28cd8a1f35f95bb406d45f4b76fa9fda2e04c`. Each created BuilderCard is one bubble. The `community` field is supplied by the card creator and is grouped automatically; it is not a membership check.

## How publication works

The [publish workflow](../.github/workflows/publish.yml) runs on pushes to `main`, every 15 minutes (at :07, :22, :37, and :52 UTC), and by **Run workflow** in GitHub Actions. It reads Mainnet, writes the versioned snapshot under `web/public/data/`, validates the snapshot, commits changed data to `main`, builds the site, and deploys that build with the official GitHub Pages actions. Only `web/public/data/` is staged for the automated commit. It never signs or submits a Sui transaction.

Scheduled runs are best effort. GitHub can delay or skip them, and can disable a public repository's schedule after prolonged inactivity. The site's last indexed time and coverage state are the record of what data visitors are actually seeing, not a promise that a particular day's run happened. Inspect the Actions history periodically, especially after quiet periods.

## One-time setup

1. Keep the repository on the `main` default branch. Under **Settings → Pages**, select **GitHub Actions** as the build and deployment source.
2. Permit this workflow to write repository contents so it can commit validated data. If branch protection blocks the bot's ordinary push to `main`, arrange an approved repository rule for this workflow; do not use a force push. The workflow fails before deployment when the commit cannot be pushed.
3. The default public Mainnet GraphQL endpoint needs no key. If using another provider, set the repository Actions variable `SUI_GRAPHQL_URL` to its endpoint after checking its historical coverage. If it needs an HTTP authorization header, set `SUI_GRAPHQL_AUTH_HEADER` as an Actions variable and `SUI_GRAPHQL_AUTH_VALUE` as an Actions secret. Never put a provider credential in Vite variables, `web/public/data/`, or committed files.
4. Trigger **Run workflow** in **Actions → Sync BuilderCards and publish map** and inspect both jobs. The `sync-and-build` job must complete before `deploy` starts. Check the deployed site's displayed last indexed time and history-coverage state.

The workflow's default first required checkpoint is `313656344`, independently identified as this registry's creation checkpoint in [Mainnet chain validation](CHAIN_VALIDATION.md). The indexer independently checks the registry's version 1 creation checkpoint and requires the creation transaction to appear in its paginated candidate scan before it sets `completeHistory` to true. Override the checkpoint only if new chain evidence corrects the recorded value.

The initial run may take longer than later runs. The workflow has a five-hour job limit; if a full backfill exceeds it, use the manual workflow's optional `from_checkpoint` and `to_checkpoint` inputs to scan bounded ranges, or use a suitable archival source, then run the workflow again without bounds for catch-up. Review coverage after each range. Do not mark coverage complete to make a deploy pass.

## Local sync and verification

Use Node.js 22. In PowerShell, from the repository root:

```powershell
cd indexer
npm ci
npm run sync
npm run validate
cd ../web
npm ci
$env:GITHUB_PAGES = 'true'
npm run build
Remove-Item Env:GITHUB_PAGES
```

`npm run sync` is repeatable: it revisits a checkpoint overlap and merges by BuilderCard object ID. `npm run validate` checks the generated manifest, shards, and hashes. Review changed files under `web/public/data/` before committing them. The generated snapshot must not contain API keys or private data. Chain strings and builder websites are public, untrusted input.

Supported optional indexer configuration:

| Variable | Use |
| --- | --- |
| `SUI_GRAPHQL_URL` | Alternate Mainnet GraphQL endpoint. The public endpoint is the default. |
| `FIRST_REQUIRED_CHECKPOINT` | The workflow defaults to verified registry creation checkpoint `313656344`. Override only with stronger evidence. Local runs may set it explicitly. |
| `SUI_GRAPHQL_AUTH_HEADER` and `SUI_GRAPHQL_AUTH_VALUE` | Optional custom-provider HTTP header name and value. Keep the value in a secret. |
| `SYNC_OVERLAP_CHECKPOINTS` | Checkpoints to re-read on each run (default 1000). |
| `SYNC_PAGE_SIZE` | Candidate page size (default 20); lower it if the provider rejects large queries. |
| `SYNC_FROM_CHECKPOINT` and `SYNC_TO_CHECKPOINT` | Optional inclusive range for a bounded backfill. The manual GitHub workflow exposes them as `from_checkpoint` and `to_checkpoint`; scheduled and push runs leave them unset. |

For a local run using the verified registry creation checkpoint:

```powershell
$env:FIRST_REQUIRED_CHECKPOINT = '313656344'
cd indexer
npm run sync
npm run validate
Remove-Item Env:FIRST_REQUIRED_CHECKPOINT
```

## Proving historical coverage

The public GraphQL service may retain only part of Mainnet history. Before claiming that the map includes every card, establish the registry's creation or first relevant checkpoint from a reliable chain record, then confirm contiguous scanning from that checkpoint through the manifest's last committed checkpoint. An affected-registry transaction is only a candidate; the indexer must confirm a successful call and a newly created BuilderCard. Review unclassified candidates and samples from the beginning, middle, and recent end of the range against their transaction effects and card objects.

If the public endpoint cannot query back to the required checkpoint, keep `completeHistory` false and show the gap. Use an archival-capable Mainnet provider or checkpoint data source to fill it. Provider rates and archival access terms vary; chain reads require no SUI gas, but an archival provider may charge. Do not infer completeness from the registry's current counter or from a successful recent sync.

## Failures and recovery

| Symptom | Action |
| --- | --- |
| Scheduled run missing or late | Check the workflow's Actions history and whether scheduling is enabled. Run it manually. A later scan should catch up by checkpoint; verify the displayed last indexed time afterwards. GitHub may disable schedules in inactive public repositories. |
| Provider timeout or rate limit | Keep the previous published snapshot. Retry manually after the provider recovers, lower `SYNC_PAGE_SIZE` if needed, or use a provider with suitable limits. Verify the checkpoint range and candidate diagnostics after recovery. |
| Earlier records unavailable | Keep coverage marked incomplete. Obtain an archival-capable source and backfill the missing interval. Validate the whole snapshot before committing or deploying. |
| Unclassified candidate or schema change | Inspect its transaction digest, successful Move call, registry argument, created-object effects, and card fields. Update the classifier and add a real fixture before replaying that checkpoint interval. Do not silently treat it as a bubble. |
| Snapshot validation fails | Inspect duplicate card IDs, shard hashes, manifest counts, and coverage gaps. Repair the indexer or source data, rerun sync and validation. The workflow stops before commit or deploy. |
| Data commit push rejected | Check branch protection and whether `main` advanced while the workflow ran. Rerun from the latest `main`. Do not force push. No uncommitted snapshot should be deployed. |
| Pages deploy fails | Confirm **Settings → Pages → GitHub Actions** and that the `github-pages` environment permits deployment. Rerun the workflow; the committed, validated data can be built again. |

The visible site keeps the previous valid deployment after a failed run. A successful build or deploy does not prove complete history: check the manifest's coverage state and diagnostic candidates separately. If unattended freshness becomes important, move this same batch sync to a monitored scheduler while retaining the snapshot contract.

## Cost and credentials

Reading public Sui data requires no wallet and no SUI gas. A public GitHub repository can use GitHub Pages and standard hosted Actions runners under GitHub's published free terms. Costs may arise from a paid archival or higher-capacity data provider, private-repository usage, or a different scheduler. Check current provider and GitHub terms before committing to an operating budget. Explorer pages are verification links for visitors; the indexer queries chain data, not explorer HTML.

Further reading: [Sui GraphQL querying and retention](https://docs.sui.io/develop/accessing-data/graphql/query-with-graphql), [GitHub Pages with Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), and [Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage).
