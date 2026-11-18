# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/AlexBeracun/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/AlexBeracun/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Radar-2: a snapshot-calibrated token launch radar. It ranks 198 pre-token
protocols by implied token value, fitted from a size curve over 128 traded
comparables (log10 market cap on log10 TVL, with shrunk category premiums),
validated blind (leave-one-out and walk-forward: the curve beats the
flat-multiple baseline on every measure), with launch odds from a logistic
classifier and farm plans netted to the dollar (payout, gas, hours, net,
$/hour, break-even odds, FARM / MARGINAL / SKIP verdicts). The dashboard is
a sortable, filterable board with implied-value bands, a log-log scatter of
comps against ranked rows, and a full methodology panel. All 758 protocols
in the sealed snapshot are accounted for. Deterministic: two runs write
byte-identical output. Node 22, standard library only, no network.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ajkq5baq&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
