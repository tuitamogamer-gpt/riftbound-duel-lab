import { describe, expect, it } from "vitest";
import { validateBenchmarkResume } from "../scripts/bot-benchmark-report";

const comparisons = [
  ["hard", "normal"],
  ["expert", "hard"],
] as const;
const identities = [0, 1].map((side) => ({
  pair: 0,
  side,
  decks: ["left", "right"],
  deckProfiles: ["equipment", "xp"],
  seed: 1201,
  firstPlayer: 0,
}));
function fixture() {
  const expected = {
    configVersion: "current",
    configuration: { hard: { nodes: 1100 }, normal: { nodes: 480 } },
    matchConfig: {
      rulesVersion: "current-rules",
      cardDataVersion: "current-cards",
    },
    pairsPerComparison: 1,
    deterministicNodes: true,
    deckLists: [{ id: "left", main: [{ cardId: "one", count: 3 }] }],
  };
  const metrics = () => ({
    decisions: 1,
    fallbackDecisions: 0,
    incompleteDecisions: 0,
    sampledDecisions: 0,
    maxDepth: 1,
    timings: [12],
  });
  const previous: any = {
    ...structuredClone(expected),
    status: "running",
    comparisons: [
      {
        strong: "hard",
        weak: "normal",
        wins: { strong: 1, weak: 0 },
        illegal: 0,
        blocked: 0,
        decisions: 2,
        fallbackDecisions: 0,
        incompleteDecisions: 0,
        games: [
          {
            ...structuredClone(identities[0]),
            winner: "hard",
            decisions: 2,
            durationMs: 40,
          },
        ],
        timings: [12, 12],
        levels: { hard: metrics(), normal: metrics() },
      },
    ],
  };
  return { expected, previous };
}

describe("paired benchmark checkpoint continuation", () => {
  it("accepts a completed-game prefix without mutating its retained measurements", () => {
    const { expected, previous } = fixture();
    const original = structuredClone(previous);
    expect(() =>
      validateBenchmarkResume(previous, expected, comparisons, identities),
    ).not.toThrow();
    expect(previous).toEqual(original);
  });
  it("rejects changed rules, list contents, node configuration and comparison ordering", () => {
    for (const mutate of [
      (report: any) => (report.matchConfig.rulesVersion = "different"),
      (report: any) => (report.deckLists[0].main[0].count = 2),
      (report: any) => (report.configuration.hard.nodes = 1000),
      (report: any) => (report.comparisons[0].strong = "expert"),
    ]) {
      const { expected, previous } = fixture();
      mutate(previous);
      expect(() =>
        validateBenchmarkResume(previous, expected, comparisons, identities),
      ).toThrow(/Cannot resume benchmark/);
    }
  });
  it("rejects skipped, duplicated and differently seeded seat pairs", () => {
    for (const mutate of [
      (report: any) => (report.comparisons[0].games[0].side = 1),
      (report: any) => (report.comparisons[0].games[0].seed = 1202),
      (report: any) =>
        report.comparisons[0].games.push(
          structuredClone(report.comparisons[0].games[0]),
        ),
    ]) {
      const { expected, previous } = fixture();
      mutate(previous);
      expect(() =>
        validateBenchmarkResume(previous, expected, comparisons, identities),
      ).toThrow(/differs/);
    }
  });
  it("rejects totals that lose decisions, fallback counts or exact timing samples", () => {
    for (const mutate of [
      (report: any) => (report.comparisons[0].decisions = 1),
      (report: any) =>
        (report.comparisons[0].levels.hard.fallbackDecisions = 1),
      (report: any) => report.comparisons[0].timings.pop(),
      (report: any) => (report.comparisons[0].levels.hard.timings[0] = -1),
      (report: any) => (report.comparisons[0].wins.strong = 0),
    ]) {
      const { expected, previous } = fixture();
      mutate(previous);
      expect(() =>
        validateBenchmarkResume(previous, expected, comparisons, identities),
      ).toThrow(/Cannot resume benchmark/);
    }
  });
  it("rejects an unfinished game and a falsely completed cohort", () => {
    const { expected, previous } = fixture();
    previous.comparisons[0].games[0].winner = null;
    expect(() =>
      validateBenchmarkResume(previous, expected, comparisons, identities),
    ).toThrow(/unfinished game/);
    const complete = fixture().previous;
    complete.status = "completed";
    expect(() =>
      validateBenchmarkResume(complete, expected, comparisons, identities),
    ).toThrow(/full cohort/);
  });
  it("retains a reported illegal game and its failed decision instead of erasing the failure", () => {
    const { expected, previous } = fixture();
    const record = previous.comparisons[0];
    record.games[0].winner = null;
    record.games[0].error = "Illegal action";
    record.wins.strong = 0;
    record.illegal = 1;
    record.decisions++;
    record.timings.push(20);
    record.levels.hard.decisions++;
    record.levels.hard.timings.push(20);
    const original = structuredClone(previous);
    expect(() =>
      validateBenchmarkResume(previous, expected, comparisons, identities),
    ).not.toThrow();
    expect(previous).toEqual(original);
  });
});
