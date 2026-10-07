import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const expectedPath = args
  .find((arg) => arg.startsWith("--expected="))
  ?.slice(11);
const outputPath = args.find((arg) => arg.startsWith("--output="))?.slice(9);
const paths = args.filter((arg) => !arg.startsWith("--"));
if (!expectedPath || !paths.length)
  throw new Error(
    "Usage: node scripts/summarize-regression-reports.mjs --expected=collected-tests.json [--output=summary.json] report.json ...",
  );

const fileName = (path) =>
  path.replaceAll("\\", "/").replace(/^.*\/tests\//, "tests/");
const testName = (name) =>
  name
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /completes ['"]([^'"]+ vs [^'"]+)['"] with card\/rune/g,
      "completes $1 with card/rune",
    );
const identity = (file, name) => `${fileName(file)}\n${testName(name)}`;
const expected = new Map(
  JSON.parse(readFileSync(expectedPath, "utf8")).map((test) => [
    identity(test.file, test.name),
    { file: fileName(test.file), fullName: testName(test.name) },
  ]),
);
if (!expected.size) throw new Error("The collected test list is empty.");
const reports = paths
  .map((path, index) => ({
    path,
    index,
    report: JSON.parse(readFileSync(path, "utf8")),
  }))
  .sort(
    (a, b) =>
      (a.report.startTime ?? 0) - (b.report.startTime ?? 0) ||
      a.index - b.index,
  );

const current = new Map();
const sourceReports = [];
const unresolvedSourceErrors = [];
let unmatchedSourceAssertions = 0;
for (const { path, report } of reports) {
  sourceReports.push({
    path,
    startTime: report.startTime ?? null,
    success: report.success,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    pending: report.numPendingTests,
  });
  if (report.success !== true && report.numFailedTests === 0)
    unresolvedSourceErrors.push({
      path,
      reason: "Unsuccessful report without an assertion failure to resolve",
    });
  for (const suite of report.testResults)
    for (const assertion of suite.assertionResults) {
      const key = identity(suite.name, assertion.fullName);
      if (!expected.has(key)) {
        unmatchedSourceAssertions++;
        continue;
      }
      // A partial rerun's unselected cases are pending, not newly executed failures.
      if (!["passed", "failed"].includes(assertion.status)) continue;
      current.set(key, {
        ...expected.get(key),
        status: assertion.status,
        source: path,
        durationMs: assertion.duration ?? null,
        ...(assertion.status === "failed"
          ? { failures: assertion.failureMessages }
          : {}),
      });
    }
}
const failed = [...current.values()].filter((test) => test.status === "failed");
const missing = [...expected]
  .filter(([key]) => !current.has(key))
  .map(([, test]) => test);
const passed = [...current.values()].filter((test) => test.status === "passed");
const git = (args) =>
  spawnSync("git", args, { encoding: "utf8" }).stdout.trim();
const summary = {
  generatedAt: new Date().toISOString(),
  baseHeadAtSummary: git(["rev-parse", "HEAD"]),
  workingTreeModifiedAtSummary: Boolean(git(["status", "--porcelain"])),
  sourceNote:
    "Reports are working-tree checkpoints; failed initial reports remain recorded, with later executed cases replacing earlier results.",
  expectedPath,
  expectedFiles: new Set([...expected.values()].map((test) => test.file)).size,
  expectedUniqueTests: expected.size,
  passedUniqueTests: passed.length,
  failedUniqueTests: failed.length,
  missingUniqueTests: missing.length,
  success: !failed.length && !missing.length && !unresolvedSourceErrors.length,
  sourceReports,
  unmatchedSourceAssertions,
  unresolvedSourceErrors,
  failed,
  missing,
  passed,
};
if (outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
}
console.log(
  JSON.stringify({
    expectedFiles: summary.expectedFiles,
    expectedUniqueTests: summary.expectedUniqueTests,
    passedUniqueTests: passed.length,
    failedUniqueTests: failed.length,
    missingUniqueTests: missing.length,
    success: summary.success,
    ...(outputPath ? { output: outputPath } : {}),
  }),
);
if (!summary.success) process.exitCode = 1;
