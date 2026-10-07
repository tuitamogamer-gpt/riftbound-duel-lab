import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const expectedPath = args
  .find((arg) => arg.startsWith("--expected="))
  ?.slice(11);
const outputPath = args.find((arg) => arg.startsWith("--output="))?.slice(9);
const paths = args.filter((arg) => !arg.startsWith("--"));
if (!expectedPath || !outputPath || !paths.length)
  throw new Error(
    "Usage: node scripts/reconcile-precon-reports.mjs --expected=collected-tests.json --output=matrix.json report.json ...",
  );
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
const expected = JSON.parse(readFileSync(expectedPath, "utf8"))
  .filter((test) =>
    test.file.replaceAll("\\", "/").endsWith("/tests/precon-effects.test.ts"),
  )
  .map((test) => normalize(test.name));
if (new Set(expected).size !== expected.length || !expected.length)
  throw new Error("Collected precon identities are empty or ambiguous");
const current = new Map();
const reports = paths
  .map((path, index) => {
    const raw = readFileSync(path, "utf8");
    return {
      path,
      index,
      report: JSON.parse(raw),
      sha256: createHash("sha256").update(raw).digest("hex"),
    };
  })
  .sort(
    (a, b) =>
      (a.report.checkpointTime ?? a.report.startTime ?? 0) -
        (b.report.checkpointTime ?? b.report.startTime ?? 0) ||
      a.index - b.index,
  );
for (const { path, report } of reports) {
  if (report.success !== true && report.numFailedTests === 0)
    throw new Error(
      `${path}: unsuccessful source report has an unresolved runner error`,
    );
  for (const suite of report.testResults) {
    if (
      !suite.name
        .replaceAll("\\", "/")
        .endsWith("/tests/precon-effects.test.ts")
    )
      continue;
    for (const test of suite.assertionResults) {
      if (!["passed", "failed"].includes(test.status)) continue;
      const name = normalize(test.fullName);
      if (!expected.includes(name))
        throw new Error(`${path}: uncollected executed precon ${name}`);
      current.set(name, {
        ...test,
        fullName: name,
        title: name.startsWith("all published starter precon matchups ")
          ? name.slice("all published starter precon matchups ".length)
          : name,
        evidenceSource: path,
      });
    }
  }
}
const missing = expected.filter((name) => !current.has(name));
const failed = [...current.values()].filter((test) => test.status === "failed");
if (missing.length || failed.length)
  throw new Error(
    `Incomplete precon evidence: ${missing.length} missing, ${failed.length} failed`,
  );
const report = {
  startTime: null,
  checkpointTime: Date.now(),
  success: true,
  numTotalTests: expected.length,
  numPassedTests: expected.length,
  numFailedTests: 0,
  numPendingTests: 0,
  recovery: {
    kind: "reconciled-executed-checkpoints",
    successScope:
      "All unique expected cases have a latest executed passing result",
    note: "This combines retained completed cases with executed continuation reports. It is not an uninterrupted whole-file Vitest run. Unselected pending cases in continuation reports do not replace completed evidence.",
    sources: reports.map(({ path, sha256, report }) => ({
      path,
      sha256,
      startTime: report.startTime,
      ...(report.checkpointTime
        ? { checkpointTime: report.checkpointTime }
        : {}),
      success: report.success,
      ...(report.recovery ? { recovery: report.recovery } : {}),
    })),
  },
  testResults: [
    {
      name: `${process.cwd()}/tests/precon-effects.test.ts`,
      assertionResults: expected.map((name) => current.get(name)),
    },
  ],
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Reconciled ${expected.length} unique passing precon cases into ${outputPath}`,
);
