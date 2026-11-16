# media-mix-simulator

A small Monte Carlo planning model for splitting a monthly ad budget across channels when the sale is slow and large, returning a low, mid and high band for every step from click to revenue.

## Who it is for

- Owners and marketers at service businesses with a long sales cycle (recruiting, consulting, agencies, B2B software) who are about to spend on LinkedIn, Google Search and Meta and want to see the spread of likely outcomes before they do.
- Consultants who need to show a client an honest range instead of one confident number.
- Developers who want a short, readable, dependency-free example of a seeded Monte Carlo model in TypeScript.

## What it does

- Takes a monthly budget, a number of months, a split across channels, and a range for every rate in the funnel.
- Runs the plan 2,000 times, drawing each rate from its range on every run.
- Returns low, mid and high bands (10th percentile, median, 90th percentile) for clicks, leads, calls, opportunities, deals, revenue and cost per lead, in total and per channel for clicks and leads.
- Returns the chance of at least one deal and the chance that revenue covers the spend within the period.
- Is deterministic: the same inputs and seed always give the same result, so two people looking at the same plan see the same numbers.
- Ships a single-file demo page (`demo/index.html`) with sliders, no build step and no dependencies.

## Quick start

Requires Node 20 or later.

```bash
git clone <this repository>
cd media-mix-simulator
npm install
npm run example
```

`examples/quick-start.ts`:

```ts
import { DEFAULT_CHANNELS, DEFAULT_FUNNEL, simulate, type Band } from "../src/index.js";

// $3,000 a month for 3 months: half LinkedIn, 30% Google Search, 20% Meta.
const result = simulate({
  monthly: 3000,
  months: 3,
  split: { linkedin: 50, google: 30, meta: 20 },
  channels: DEFAULT_CHANNELS, // illustrative assumptions, replace with your own
  funnel: DEFAULT_FUNNEL, // illustrative assumptions, replace with your own
});

const row = (label: string, b: Band, digits = 0) =>
  console.log(label.padEnd(14), [b.low, b.mid, b.high].map((n) => n.toFixed(digits).padStart(8)).join(""));

console.log(`Spend over ${result.months} months: $${result.spend}`);
console.log("".padEnd(14), ["low", "mid", "high"].map((s) => s.padStart(8)).join(""));
row("clicks", result.clicks);
row("leads", result.leads, 1);
row("calls", result.calls, 1);
row("opportunities", result.opportunities, 2);
row("deals", result.deals, 2);
row("revenue", result.revenue);
row("cost per lead", result.costPerLead);
console.log(`Chance of at least one deal: ${Math.round(result.chanceOfDeal * 100)}%`);
console.log(`Chance revenue covers spend: ${Math.round(result.chanceOfPayback * 100)}%`);
```

Output:

```text
Spend over 3 months: $9000
                    low     mid    high
clicks              996    1195    1552
leads              12.1    15.9    20.5
calls               5.1     7.1     9.7
opportunities      1.19    1.77    2.53
deals              0.28    0.44    0.67
revenue            5908    9810   15565
cost per lead       439     566     744
Chance of at least one deal: 37%
Chance revenue covers spend: 37%
```

Those numbers come from the default assumptions, which are invented. They say what the model does with those ranges and nothing about any real campaign.

## The demo page

Open `demo/index.html` in a browser. It is one static file with inline CSS and an inline copy of `simulate`, so it can be served from GitHub Pages as is (Settings, Pages, deploy from the branch, then open `/demo/`). It has a budget slider, a months slider, three split sliders, four example splits and the result bands. It follows the system light or dark setting and works at phone width.

A test (`tests/simulate.test.ts`) reads the page, runs its inline copy of the model and checks that it returns the same numbers as the library.

## Using your own numbers

The defaults are **illustrative assumptions, replace with your own**. They describe no real account.

```ts
import { simulate, type ChannelModel, type FunnelModel } from "media-mix-simulator";

const channels: ChannelModel[] = [
  { key: "linkedin", name: "LinkedIn", cpc: { low: 9, high: 14 }, leadRate: { low: 0.015, high: 0.03 } },
  { key: "newsletter", name: "Newsletter sponsorship", cpc: { low: 3, high: 6 }, leadRate: { low: 0.005, high: 0.02 } },
];

const funnel: FunnelModel = {
  leadToCall: { low: 0.25, high: 0.5 },
  callToOpportunity: { low: 0.2, high: 0.4 },
  opportunityToDeal: { low: 0.2, high: 0.3 },
  dealValue: { low: 8000, high: 20000 },
};

const result = simulate({ monthly: 5000, months: 6, split: { linkedin: 70, newsletter: 30 }, channels, funnel });
```

- Channel keys are any strings. The split is a set of relative weights, so `{ a: 70, b: 30 }` and `{ a: 7, b: 3 }` mean the same thing.
- A range with `low` equal to `high` is a fixed value.
- `runs` (default 2000) and `seed` are optional.

## How it works

1. **Ranges, not points.** Every input rate is a `{ low, high }` range: cost per click and click-to-lead rate per channel, then lead-to-call, call-to-opportunity, opportunity-to-deal and revenue per deal for the shared funnel.
2. **One run.** For each channel, the model takes that channel's share of the total spend, draws a click price and a lead rate, and computes clicks and leads. It adds the channels up, then draws the three funnel rates and a deal value to get calls, opportunities, deals and revenue. These are expected values, so deals can be a fraction such as 0.44.
3. **The draw.** Each value is the average of two uniform random numbers scaled to the range. That gives a triangular distribution: values near the middle of the range are most likely, and the ends are rare.
4. **Whole deals.** A deal happens or it does not. On each run the expected deal count is turned into a whole number with a Poisson draw. If it is one or more, the run counts toward "chance of at least one deal". If that count times a freshly drawn deal value is at least the spend, the run counts toward "chance of payback".
5. **Bands.** After all runs, each metric is sorted. Low is the 10th percentile, mid is the median, high is the 90th. The middle 80 percent of runs fall between low and high.
6. **Repeatable.** Random numbers come from a seeded generator (mulberry32), so results do not change between runs or machines.

### Limits

This is a planning aid for thinking about ranges. It does not forecast.

- The output is only as good as the ranges you give it. With invented ranges you get invented results.
- Channels are independent and share one funnel after the lead. In practice lead quality differs by channel.
- There is no ceiling on what a channel can absorb. A niche search term may not have enough searches to spend the budget you assign to it, and the model will not tell you.
- No time dimension: no learning period, no seasonality, and no lag between a lead and a closed deal. With a long sales cycle, deals from a three-month test often close after the three months.
- Rates are drawn independently on each run. Real rates tend to move together (a weak offer hurts every step).
- The triangular draw and the Poisson step are simple modeling choices, not fitted to data.
- The Poisson draw is capped at 50 events per run, which only matters for plans that expect dozens of deals.

## API

| Export | What it is |
|---|---|
| `simulate(input)` | Runs the model. Returns a `SimResult`. |
| `DEFAULT_CHANNELS`, `DEFAULT_FUNNEL` | Illustrative assumptions for LinkedIn, Google Search and Meta. Replace with your own. |
| `PRESETS` | Four example splits for the default channels. |
| `mulberry32(seed)` | The seeded random number generator the model uses. |
| Types | `Range`, `Band`, `ChannelModel`, `FunnelModel`, `Split`, `SimInput`, `SimResult`, `Preset` |

## Development

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # emits dist/
```

The library has no runtime dependencies.

## How this was built

Designed and directed by Justin Beegel, written with AI coding assistance, then reviewed and tested. It was extracted from a production client system at NUDGE, with all client data removed. The channel ranges, funnel rates and deal values in this repository are invented for illustration.

## Work with me

I help businesses find where search, AI and automation will move them forward: https://nudgemeforward.com

## License

MIT. Copyright (c) 2026 Justin Beegel.
