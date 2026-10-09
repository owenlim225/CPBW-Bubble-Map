# CPBW Bubble Map

A read-only, animated map of successful Sui Mainnet BuilderCard creations using the [Cryptita Plays Builder Registry](https://suiscan.xyz/mainnet/object/0x297cb610c0c47edc1e12008812f28cd8a1f35f95bb406d45f4b76fa9fda2e04c). Each bubble is one created card. Color and cluster come from the self-declared `community` field; they do not verify membership or represent transactions between builders.

The first validated snapshot contains **42 BuilderCards in 9 communities**, complete from registry creation checkpoint **313656344** through checkpoint **329156761** (as of 2 October 2026). The site displays its actual last indexed time and coverage state as the data changes.

## Run locally

Use Node.js 22 or newer. In separate terminals:

```powershell
cd indexer
npm ci
npm test
npm run validate
```

```powershell
cd web
npm ci
npm run dev
```

Open the local address printed by Vite. Run `npm run sync` from `indexer/` to refresh the static snapshot from Sui Mainnet. The collector does not need a wallet, submit transactions, or scrape blockchain explorer pages.

## Project files

- [Product and delivery plan](PLAN.md)
- [Chain validation](docs/CHAIN_VALIDATION.md)
- [Collector details](indexer/README.md)
- [Publication and recovery runbook](docs/OPERATIONS.md)
- [GitHub Pages workflow](.github/workflows/publish.yml)

The website is in `web/`; its generated, integrity-checked data is in `web/public/data/`. The collector is in `indexer/`. The GitHub Actions workflow checks for new on-chain BuilderCards every 15 minutes and publishes the site after validation. Initial GitHub Pages setup is described in the runbook.