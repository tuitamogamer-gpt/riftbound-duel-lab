import { isDeepStrictEqual } from "node:util";

export type BenchmarkIdentity = {
  pair: number;
  side: number;
  decks: string[];
  deckProfiles: string[];
  seed: number;
  firstPlayer: number;
};

/** Reject a different cohort or incomplete/corrupt metrics before skipping games. */
export function validateBenchmarkResume(
  previous: any,
  expected: any,
  comparisons: readonly (readonly [string, string])[],
  identities: BenchmarkIdentity[],
) {
  const fail = (message: string): never => {
    throw new Error(`Cannot resume benchmark: ${message}`);
  };
  for (const key of [
    "configVersion",
    "configuration",
    "matchConfig",
    "pairsPerComparison",
    "deterministicNodes",
    "deckLists",
  ])
    if (!isDeepStrictEqual(previous?.[key], expected[key]))
      fail(`${key} differs`);
  if (!["running", "completed"].includes(previous.status))
    fail("unknown checkpoint status");
  if (
    !Array.isArray(previous.comparisons) ||
    previous.comparisons.length > comparisons.length
  )
    fail("comparison cohort differs");
  if (
    previous.selectedComparisons &&
    !isDeepStrictEqual(previous.selectedComparisons, comparisons)
  )
    fail("selected comparisons differ");
  for (const [index, record] of previous.comparisons.entries()) {
    const [strong, weak] = comparisons[index];
    if (record.strong !== strong || record.weak !== weak)
      fail("comparison order differs");
    if (!Array.isArray(record.games) || record.games.length > identities.length)
      fail("invalid game count");
    if (
      index < previous.comparisons.length - 1 &&
      record.games.length !== identities.length
    )
      fail("a preceding comparison is incomplete");
    const wins = { strong: 0, weak: 0 };
    let illegal = 0,
      blocked = 0,
      actions = 0,
      errors = 0;
    for (const [gameIndex, game] of record.games.entries()) {
      const identity = identities[gameIndex];
      for (const key of Object.keys(identity) as (keyof BenchmarkIdentity)[])
        if (!isDeepStrictEqual(game[key], identity[key]))
          fail(`game ${index}/${gameIndex} ${key} differs`);
      if (
        !Number.isInteger(game.decisions) ||
        game.decisions < 0 ||
        game.decisions > 1800 ||
        !Number.isFinite(game.durationMs) ||
        game.durationMs < 0
      )
        fail("invalid completed-game metrics");
      actions += game.decisions;
      if (game.winner === strong) wins.strong++;
      else if (game.winner === weak) wins.weak++;
      else if (game.winner !== null) fail("unknown winning policy");
      if (game.error) {
        errors++;
        if (/illegal|rejected/i.test(game.error)) illegal++;
        else blocked++;
      } else if (game.winner === null)
        fail("unfinished game cannot be skipped");
    }
    if (
      !isDeepStrictEqual(record.wins, wins) ||
      record.illegal !== illegal ||
      record.blocked !== blocked
    )
      fail("outcome totals do not match the completed games");
    for (const key of ["decisions", "fallbackDecisions", "incompleteDecisions"])
      if (!Number.isInteger(record[key]) || record[key] < 0)
        fail(`invalid ${key} total`);
    if (
      record.decisions > actions + errors ||
      (weak !== "reference" && record.decisions < actions) ||
      record.fallbackDecisions > record.decisions ||
      record.incompleteDecisions > record.decisions
    )
      fail("decision totals do not match the completed games");
    const resumable = record.games.length < identities.length;
    if (
      resumable &&
      (!Array.isArray(record.timings) ||
        record.timings.length !== record.decisions)
    )
      fail("partial comparison lacks exact timing samples");
    const levels = Object.entries(record.levels ?? {}) as [string, any][];
    if (levels.some(([level]) => ![strong, weak].includes(level)))
      fail("unknown per-level metrics");
    for (const key of ["decisions", "fallbackDecisions", "incompleteDecisions"])
      if (
        levels.reduce((sum, [, level]) => sum + level[key], 0) !== record[key]
      )
        fail(`per-level ${key} totals differ`);
    for (const [, level] of levels) {
      for (const key of [
        "decisions",
        "fallbackDecisions",
        "incompleteDecisions",
        "sampledDecisions",
        "maxDepth",
      ])
        if (!Number.isInteger(level[key]) || level[key] < 0)
          fail(`invalid per-level ${key}`);
      if (
        level.fallbackDecisions > level.decisions ||
        level.incompleteDecisions > level.decisions ||
        level.sampledDecisions > level.decisions
      )
        fail("per-level counts exceed the decisions");
      if (
        resumable &&
        (!Array.isArray(level.timings) ||
          level.timings.length !== level.decisions ||
          level.timings.some(
            (time: number) => !Number.isFinite(time) || time < 0,
          ))
      )
        fail("partial comparison lacks exact per-level timing samples");
    }
    if (
      record.timings?.some((time: number) => !Number.isFinite(time) || time < 0)
    )
      fail("invalid timing sample");
  }
  if (
    previous.status === "completed" &&
    (previous.comparisons.length !== comparisons.length ||
      previous.comparisons.some(
        (record: any) => record.games.length !== identities.length,
      ))
  )
    fail("completed checkpoint does not contain the full cohort");
}
