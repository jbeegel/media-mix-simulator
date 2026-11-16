/**
 * A small Monte Carlo planning model for splitting a monthly ad budget
 * across channels when the sale is slow and large: clicks become leads,
 * leads become calls, calls become opportunities, opportunities become
 * deals.
 *
 * Every rate is a range, not a point. The model runs the plan many times,
 * drawing each rate from its range, and reports where the middle 80 percent
 * of runs fall. It is a planning aid. It does not forecast.
 */

export interface Range {
  low: number;
  high: number;
}

export interface ChannelModel {
  /** Short identifier, used as the key in a split. */
  key: string;
  name: string;
  /** What the channel is for in the plan, in one line. */
  role?: string;
  /** Cost per click in dollars. */
  cpc: Range;
  /** Share of clicks that become a lead, as a fraction. */
  leadRate: Range;
  /** Where the click price came from: your own account data, or a guess. */
  cpcSource?: "measured" | "assumption";
}

export interface FunnelModel {
  /** Lead to a booked call. */
  leadToCall: Range;
  /** Call to a qualified opportunity (a signed engagement, a proposal). */
  callToOpportunity: Range;
  /** Opportunity to a closed deal. */
  opportunityToDeal: Range;
  /** Revenue per deal in dollars. */
  dealValue: Range;
}

/** Budget weight per channel key. Weights are relative; they need not add up to 100. */
export type Split = Record<string, number>;

/**
 * Illustrative assumptions. Replace with your own.
 *
 * These ranges describe no real account. They are plausible starting points
 * for a business-to-business service with a long sales cycle, there so the
 * model runs out of the box. Use your own click prices and conversion rates
 * as soon as you have them.
 */
export const DEFAULT_CHANNELS: ChannelModel[] = [
  { key: "linkedin", name: "LinkedIn", role: "Reach buyers by job title and industry.", cpc: { low: 8, high: 18 }, leadRate: { low: 0.01, high: 0.04 }, cpcSource: "assumption" },
  { key: "google", name: "Google Search", role: "Catch the few buyers who are searching for the service right now.", cpc: { low: 10, high: 40 }, leadRate: { low: 0.02, high: 0.06 }, cpcSource: "assumption" },
  { key: "meta", name: "Meta", role: "Bring back people who already visited the site.", cpc: { low: 1, high: 4 }, leadRate: { low: 0.001, high: 0.006 }, cpcSource: "assumption" },
];

/** Illustrative assumptions. Replace with your own. */
export const DEFAULT_FUNNEL: FunnelModel = {
  leadToCall: { low: 0.3, high: 0.6 },
  callToOpportunity: { low: 0.15, high: 0.35 },
  opportunityToDeal: { low: 0.15, high: 0.35 },
  dealValue: { low: 15000, high: 30000 },
};

export interface Preset {
  key: string;
  label: string;
  split: Split;
  note: string;
}

/** Example splits for the default channels, for comparison. */
export const PRESETS: Preset[] = [
  { key: "balanced", label: "Targeted first", split: { linkedin: 50, google: 30, meta: 20 }, note: "Half on LinkedIn for precise buyer targeting, under a third on Google where search demand for a niche service is small, the rest on Meta for retargeting." },
  { key: "linkedin", label: "LinkedIn only", split: { linkedin: 100, google: 0, meta: 0 }, note: "One channel with enough budget to learn from can beat three that each get too little. Worth comparing at small budgets." },
  { key: "search", label: "Search led", split: { linkedin: 20, google: 60, meta: 20 }, note: "Highest intent per click, but a niche service may not have enough searches to absorb this much. The model does not cap spend by search volume." },
  { key: "even", label: "Even split", split: { linkedin: 34, google: 33, meta: 33 }, note: "Shown for comparison. It funds Meta heavily, where the assumed lead rate is lowest." },
];

/** Deterministic random numbers, so the same inputs always give the same result. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A value between low and high, most likely near the middle (triangular). */
function draw(r: Range, rnd: () => number): number {
  const u = (rnd() + rnd()) / 2;
  return r.low + (r.high - r.low) * u;
}

/** A whole number of events when the expected number is `mean`. */
function poisson(mean: number, rnd: () => number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rnd();
  while (p > limit && k < 50) {
    k++;
    p *= rnd();
  }
  return k;
}

export interface Band {
  /** 10th percentile of the runs. */
  low: number;
  /** Median of the runs. */
  mid: number;
  /** 90th percentile of the runs. */
  high: number;
}

function band(values: number[]): Band {
  const s = [...values].sort((a, b) => a - b);
  const last = s.length - 1;
  const at = (p: number) => {
    const i = Math.floor(p * last);
    return s[i < 0 ? 0 : Math.min(last, i)];
  };
  return { low: at(0.1), mid: at(0.5), high: at(0.9) };
}

export interface SimInput {
  /** Monthly budget in dollars, across all channels. */
  monthly: number;
  /** Number of months in the planning period. */
  months: number;
  split: Split;
  channels: ChannelModel[];
  funnel: FunnelModel;
  /** Number of simulated runs. Default 2000. */
  runs?: number;
  /** Seed for the random number generator. Same seed, same result. */
  seed?: number;
}

export interface SimResult {
  months: number;
  /** Total spend over the period. */
  spend: number;
  perChannel: Record<string, { spend: number; clicks: Band; leads: Band }>;
  clicks: Band;
  leads: Band;
  calls: Band;
  opportunities: Band;
  deals: Band;
  revenue: Band;
  costPerLead: Band;
  /** Share of runs with at least one deal in the period. */
  chanceOfDeal: number;
  /** Share of runs where deal revenue covers the spend in the period. */
  chanceOfPayback: number;
}

/**
 * Runs the plan many times, each time drawing every rate from its range,
 * and reports the range the middle 80 percent of runs fall in. Low is the
 * 10th percentile, mid the median, high the 90th.
 */
export function simulate(input: SimInput): SimResult {
  const { monthly, months, split, channels, funnel } = input;
  const runs = input.runs ?? 2000;
  const rnd = mulberry32(input.seed ?? 20261115);
  const weight = channels.reduce((n, c) => n + (split[c.key] ?? 0), 0);
  const total = weight > 1 ? weight : 1;
  const spend = monthly * months;
  const acc = { clicks: [] as number[], leads: [] as number[], calls: [] as number[], opportunities: [] as number[], deals: [] as number[], revenue: [] as number[], cpl: [] as number[] };
  const per: Record<string, { clicks: number[]; leads: number[] }> = Object.fromEntries(channels.map((c) => [c.key, { clicks: [] as number[], leads: [] as number[] }]));
  let won = 0;
  let paid = 0;
  for (let i = 0; i < runs; i++) {
    let clicks = 0;
    let leads = 0;
    for (const c of channels) {
      const budget = (spend * (split[c.key] ?? 0)) / total;
      const k = budget / draw(c.cpc, rnd);
      const l = k * draw(c.leadRate, rnd);
      per[c.key].clicks.push(k);
      per[c.key].leads.push(l);
      clicks += k;
      leads += l;
    }
    const calls = leads * draw(funnel.leadToCall, rnd);
    const opportunities = calls * draw(funnel.callToOpportunity, rnd);
    const deals = opportunities * draw(funnel.opportunityToDeal, rnd);
    const revenue = deals * draw(funnel.dealValue, rnd);
    acc.clicks.push(clicks);
    acc.leads.push(leads);
    acc.calls.push(calls);
    acc.opportunities.push(opportunities);
    acc.deals.push(deals);
    acc.revenue.push(revenue);
    acc.cpl.push(leads > 0 ? spend / leads : spend);
    // A deal happens or it does not. Turn the expected number into a whole
    // count for this run, then ask whether the revenue covers the spend.
    const whole = poisson(deals, rnd);
    if (whole >= 1) won++;
    if (whole * draw(funnel.dealValue, rnd) >= spend) paid++;
  }
  return {
    months,
    spend,
    perChannel: Object.fromEntries(channels.map((c) => [c.key, { spend: (spend * (split[c.key] ?? 0)) / total, clicks: band(per[c.key].clicks), leads: band(per[c.key].leads) }])),
    clicks: band(acc.clicks),
    leads: band(acc.leads),
    calls: band(acc.calls),
    opportunities: band(acc.opportunities),
    deals: band(acc.deals),
    revenue: band(acc.revenue),
    costPerLead: band(acc.cpl),
    chanceOfDeal: won / runs,
    chanceOfPayback: paid / runs,
  };
}
