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
