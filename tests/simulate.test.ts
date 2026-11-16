import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CHANNELS, DEFAULT_FUNNEL, PRESETS, mulberry32, simulate, type SimResult } from "../src/index.js";

const base = { months: 3, split: PRESETS[0].split, channels: DEFAULT_CHANNELS, funnel: DEFAULT_FUNNEL };
const BANDS = ["clicks", "leads", "calls", "opportunities", "deals", "revenue", "costPerLead"] as const;

describe("simulate", () => {
  it("gives the same result for the same inputs", () => {
    expect(simulate({ ...base, monthly: 3000 })).toEqual(simulate({ ...base, monthly: 3000 }));
  });

  it("gives a different result for a different seed", () => {
    expect(simulate({ ...base, monthly: 3000, seed: 1 })).not.toEqual(simulate({ ...base, monthly: 3000, seed: 2 }));
  });

  it("orders each band low, mid, high and scales with budget", () => {
    const a = simulate({ ...base, monthly: 2000 });
    const b = simulate({ ...base, monthly: 6000 });
    for (const r of [a, b]) {
      for (const k of BANDS) {
        expect(r[k].low).toBeLessThanOrEqual(r[k].mid);
        expect(r[k].mid).toBeLessThanOrEqual(r[k].high);
      }
    }
    expect(b.leads.mid).toBeGreaterThan(a.leads.mid * 2.5);
    expect(a.spend).toBe(6000);
  });

  it("keeps clicks within what the click prices allow", () => {
    const r = simulate({ ...base, monthly: 3000, split: { linkedin: 100, google: 0, meta: 0 } });
    const li = DEFAULT_CHANNELS.find((c) => c.key === "linkedin")!;
    expect(r.clicks.high).toBeLessThanOrEqual(9000 / li.cpc.low);
    expect(r.clicks.low).toBeGreaterThanOrEqual(9000 / li.cpc.high);
    expect(r.perChannel.google.spend).toBe(0);
  });

  it("treats the split as relative weights", () => {
    const a = simulate({ ...base, monthly: 3000, split: { linkedin: 50, google: 30, meta: 20 } });
    const b = simulate({ ...base, monthly: 3000, split: { linkedin: 5, google: 3, meta: 2 } });
    expect(b.perChannel.linkedin.spend).toBeCloseTo(a.perChannel.linkedin.spend, 6);
    expect(a.perChannel.linkedin.spend + a.perChannel.google.spend + a.perChannel.meta.spend).toBeCloseTo(a.spend, 6);
  });

  it("reports chances as fractions, and payback is never likelier than a deal", () => {
    const r = simulate({ ...base, monthly: 3000 });
    expect(r.chanceOfDeal).toBeGreaterThanOrEqual(0);
    expect(r.chanceOfDeal).toBeLessThanOrEqual(1);
    expect(r.chanceOfPayback).toBeLessThanOrEqual(r.chanceOfDeal);
  });

  it("produces no clicks on a zero budget", () => {
    const r = simulate({ ...base, monthly: 0 });
    expect(r.spend).toBe(0);
    expect(r.clicks.high).toBe(0);
    expect(r.chanceOfDeal).toBe(0);
  });

  it("works with channels other than the defaults", () => {
    const r = simulate({
      monthly: 1000,
      months: 2,
      split: { podcast: 1 },
      channels: [{ key: "podcast", name: "Podcast ads", cpc: { low: 2, high: 2 }, leadRate: { low: 0.1, high: 0.1 } }],
      funnel: DEFAULT_FUNNEL,
      runs: 200,
    });
    expect(r.clicks.mid).toBeCloseTo(1000, 6);
    expect(r.leads.mid).toBeCloseTo(100, 6);
  });

  it("every preset split adds up to 100", () => {
    for (const p of PRESETS) expect(p.split.linkedin + p.split.google + p.split.meta).toBe(100);
  });
});

describe("mulberry32", () => {
  it("returns numbers from 0 up to but not including 1, repeatably", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("demo page", () => {
  const html = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
  const code = html.split("/* simulate:start */")[1].split("/* simulate:end */")[0];
  const demo = new Function(`${code}; return { simulate, DEFAULT_CHANNELS, DEFAULT_FUNNEL, PRESETS };`)() as {
    simulate: typeof simulate;
    DEFAULT_CHANNELS: typeof DEFAULT_CHANNELS;
    DEFAULT_FUNNEL: typeof DEFAULT_FUNNEL;
    PRESETS: typeof PRESETS;
  };

  it("carries the same assumptions as the library", () => {
    expect(demo.DEFAULT_FUNNEL).toEqual(DEFAULT_FUNNEL);
    expect(demo.DEFAULT_CHANNELS.map((c) => [c.key, c.cpc, c.leadRate])).toEqual(DEFAULT_CHANNELS.map((c) => [c.key, c.cpc, c.leadRate]));
    expect(demo.PRESETS.map((p) => p.split)).toEqual(PRESETS.map((p) => p.split));
  });

  it("returns the same numbers as the library", () => {
    for (const p of PRESETS) {
      const input = { monthly: 4250, months: 5, split: p.split };
      const fromDemo: SimResult = demo.simulate({ ...input, channels: demo.DEFAULT_CHANNELS, funnel: demo.DEFAULT_FUNNEL });
      expect(fromDemo).toEqual(simulate({ ...input, channels: DEFAULT_CHANNELS, funnel: DEFAULT_FUNNEL }));
    }
  });

  it("loads nothing from another site", () => {
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|@import/);
  });
});
