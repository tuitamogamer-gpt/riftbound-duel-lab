import { readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Recover only completed assertions from retained logs after an interrupted runner.
// This produces evidence subsets, never a claim that an interrupted run finished.
const directory = process.argv[2] ?? "test-results";
const read = (path) => readFileSync(`${directory}/${path}`, "utf8");
const normalize = (name) =>
  name
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/ > /g, " ")
    .trim()
    .replace(
      /completes ['"]([^'"]+ vs [^'"]+)['"] with card\/rune/g,
      "completes $1 with card/rune",
    );
const fileName = (file) => file.replace(/^.*\/tests\//, "tests/");
const currentManifest = JSON.parse(read("expected-tests-final.json"));
// This retained collection predates the later guest-seat display regression case.
const ciManifest = JSON.parse(read("expected-tests-ci.json"));
const oldManifest = JSON.parse(read("expected-tests.json"));
const canonical = (manifest) =>
  manifest.map((test) => ({
    file: fileName(test.file),
    fullName: normalize(test.name),
  }));
const current = canonical(currentManifest);
const ciExpected = canonical(ciManifest);
const old = canonical(oldManifest);
const assertion = (test, status = "passed", extra = {}) => ({
  ancestorTitles: [],
  fullName: test.fullName,
  title: test.fullName,
  status,
  failureMessages: [],
  ...extra,
});
const evidence = (path) => ({
  path: `${directory}/${path}`,
  sha256: createHash("sha256").update(read(path)).digest("hex"),
  lastModified: statSync(`${directory}/${path}`).mtime.toISOString(),
});
const save = (
  path,
  cases,
  sources,
  note,
  checkpointTime = Date.parse(sources[0].lastModified),
) => {
  const grouped = new Map();
  for (const { file, ...test } of cases) {
    if (!grouped.has(file)) grouped.set(file, new Map());
    const suite = grouped.get(file);
    if (
      suite.has(test.fullName) &&
      suite.get(test.fullName).status !== test.status
    )
      throw new Error(
        `Conflicting retained evidence: ${file}: ${test.fullName}`,
      );
    suite.set(test.fullName, test);
  }
  const all = [...grouped.values()].flatMap((suite) => [...suite.values()]);
  const failed = all.filter((test) => test.status === "failed").length;
  const passed = all.filter((test) => test.status === "passed").length;
  const report = {
    startTime: null,
    checkpointTime,
    success: failed === 0,
    numTotalTests: all.length,
    numPassedTests: passed,
    numFailedTests: failed,
    numPendingTests: 0,
    recovery: {
      kind: "retained-completed-assertions",
      checkpointTimeMeaning:
        "Modification time of the retained evidence log; the original Vitest launch timestamp is unavailable",
      successScope:
        "Only the assertions explicitly represented in this evidence subset",
      note,
      sources,
    },
    testResults: [...grouped].map(([file, tests]) => ({
      name: `${process.cwd()}/${file}`,
      assertionResults: [...tests.values()],
    })),
  };
  writeFileSync(`${directory}/${path}`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${path}: ${passed} passed, ${failed} failed`);
};
const fullLog = read("full-suite.log");
const full = [];
for (const [, file, count] of fullLog.matchAll(
  /^ ✓ (tests\/[^\n]+?) \((\d+) tests\)/gm,
)) {
  const tests = old.filter((test) => test.file === file);
  if (tests.length !== Number(count))
    throw new Error(
      `${file}: retained complete count differs from launch manifest`,
    );
  full.push(...tests.map((test) => ({ file, ...assertion(test) })));
}
const persistence = old.filter(
  (test) => test.file === "tests/persistence.test.ts",
);
const section = fullLog
  .split(" ❯ tests/persistence.test.ts")[1]
  ?.split(/^ ✓ tests\//m)[0];
if (!section) throw new Error("No retained persistence section");
for (const [, marker, name, duration] of section.matchAll(
  /^   ([✓×]) (.+?) (\d+)ms$/gm,
)) {
  const test = persistence.find((test) => test.fullName === normalize(name));
  if (!test) throw new Error(`Uncollected persistence assertion: ${name}`);
  full.push({
    file: test.file,
    ...assertion(test, marker === "✓" ? "passed" : "failed", {
      duration: Number(duration),
      failureMessages:
        marker === "×"
          ? [
              "Test timed out in 240000ms; retained original failure, requiring an executed rerun.",
            ]
          : [],
    }),
  });
}
save(
  "full-suite-recovered.json",
  full,
  [evidence("full-suite.log"), evidence("expected-tests.json")],
  "Original full run was interrupted by an environment restart. Entire passing file summaries are recovered only when their test counts exactly match the launch manifest. Explicit persistence results retain its timeout.",
);

const matrix = [];
const precon = old.filter(
  (test) => test.file === "tests/precon-effects.test.ts",
);
const matrixSources = [];
for (let shard = 0; shard < 3; shard++) {
  const path = `precon-shard-${shard}.log`;
  matrixSources.push(evidence(path));
  for (const [, name, duration] of read(path).matchAll(
    /^ ✓ tests\/precon-effects.test.ts > (.+?) (\d+)ms$/gm,
  )) {
    const test = precon.find((test) => test.fullName === normalize(name));
    if (!test) throw new Error(`Uncollected precon assertion: ${name}`);
    matrix.push({
      file: test.file,
      ...assertion(test, "passed", { duration: Number(duration) }),
    });
  }
}
save(
  "precon-recovered.json",
  matrix,
  matrixSources,
  "Three original shard runs were interrupted by an environment restart. Only verbose completed passing cases are recovered; repeated focused cases are deduplicated. Original pair identities and seeds are unchanged.",
  Math.max(...matrixSources.map((source) => Date.parse(source.lastModified))),
);

const snapshot = JSON.parse(read("simulation-progress.json"));
const simulations = [];
for (const result of snapshot.status.executed) {
  if (!["pass", "fail"].includes(result.status)) continue;
  const matches = old.filter(
    (test) =>
      test.file === "tests/simulation.test.ts" &&
      test.fullName.endsWith(` ${normalize(result.name)}`),
  );
  if (matches.length !== 1)
    throw new Error(`Ambiguous retained simulation: ${result.name}`);
  const test = matches[0];
  simulations.push({
    file: test.file,
    ...assertion(test, result.status === "pass" ? "passed" : "failed", {
      duration: result.durationMs,
      failureMessages: result.errors ?? [],
    }),
  });
}
save(
  "simulation-progress-recovered.json",
  simulations,
  [evidence("simulation-progress.json")],
  "Completed Vitest cases were captured from the live worker debugger at the recorded time. The in-progress case and all unexecuted cases are excluded; the Annie mirror timeout is retained.",
);

const ciLog = read("github-required-8a1bfca.log").replace(
  /\u001b\[[0-9;]*m/g,
  "",
);
const ci = [];
for (const [, file, count] of ciLog.matchAll(
  /✓ (tests\/[^\n]+?) \((\d+) tests\)/g,
)) {
  const tests = ciExpected.filter((test) => test.file === file);
  if (tests.length !== Number(count))
    throw new Error(
      `${file}: CI complete count differs from retained implementation manifest`,
    );
  ci.push(...tests.map((test) => ({ file, ...assertion(test) })));
}
save(
  "github-required-recovered.json",
  ci,
  [evidence("github-required-8a1bfca.log"), evidence("expected-tests-ci.json")],
  "GitHub Actions run 37684919489 passed on implementation commit 8a1bfca67a2f153bf044ce3356cc49b50547d7a8. Complete passing file summaries with exact collected counts are recovered. Its partial persistence invocation has skipped tests and is excluded.",
);

const completedPairs = new Set(matrix.map((test) => test.fullName));
const missingPairs = current.filter(
  (test) =>
    test.file === "tests/precon-effects.test.ts" &&
    test.fullName.startsWith(
      "all published starter precon matchups completes ",
    ) &&
    !completedPairs.has(test.fullName),
);
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (let shard = 0; shard < 2; shard++) {
  const selected = missingPairs.filter((_, index) => index % 2 === shard);
  const names = selected.map((test) => {
    const pair = /completes (.+?) with card\/rune/.exec(test.fullName)[1];
    return `completes ['"]?${escape(pair)}['"]? with card/rune`;
  });
  writeFileSync(
    `${directory}/precon-resume-${shard}-pattern.txt`,
    names.join("|"),
  );
  console.log(
    `Resume partition ${shard}: ${selected.length} original pair cases`,
  );
}
