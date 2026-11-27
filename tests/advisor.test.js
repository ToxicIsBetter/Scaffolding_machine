/* Scenario tests for the Scaffold Advisor.
 * CI:     python -m hub build && node tests/advisor.test.js
 * Shared with a browser runner, so keep it plain JavaScript. */
function runAdvisorCases(HubAdvisor, data, cases) {
  const A = HubAdvisor.create(data);
  const failures = [];
  for (const c of cases) {
    const fail = (msg) => failures.push(`"${c.say}": ${msg}`);
    const { factors } = A.extract(c.say);
    const r = A.recommend(factors);
    const top = r.primary ? r.primary.item.id : null;
    if (c.top) {
      if (c.top.length === 0 && top) fail(`expected no recommendation yet, got ${top}`);
      if (c.top.length && !c.top.includes(top)) fail(`top was ${top}, expected one of ${c.top.join(", ")}  [factors: ${[...factors].join(", ")}]`);
    }
    (c.not_top || []).forEach((id) => top === id && fail(`${id} should not be the top pick`));
    const addons = r.addons.map((a) => a.item.id);
    (c.addons || []).forEach((id) => !addons.includes(id) && fail(`missing add-on ${id} (got ${addons.join(", ") || "none"})`));
    (c.no_addons || []).forEach((id) => addons.includes(id) && fail(`unexpected add-on ${id}`));
    const uns = r.unsuitable.map((u) => u.item.id);
    (c.unsuitable || []).forEach((id) => !uns.includes(id) && fail(`${id} should be flagged unsuitable (got ${uns.join(", ") || "none"})`));
    (c.has || []).forEach((f) => !factors.has(f) && fail(`should detect ${f}`));
    (c.lacks || []).forEach((f) => factors.has(f) && fail(`should NOT detect ${f} (negated)`));
    if (c.asks) {
      const q = A.nextQuestion(factors, new Set());
      if (!q || q.id !== c.asks) fail(`first question should be '${c.asks}', got ${q && q.id}`);
    }
  }
  return failures;
}

if (typeof module !== "undefined" && require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..");
  const HubAdvisor = require(path.join(root, "templates", "advisor.js"));
  const data = JSON.parse(fs.readFileSync(path.join(root, "dist", "hub-data.json"), "utf8"));
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "advisor_cases.json"), "utf8"));
  const failures = runAdvisorCases(HubAdvisor, data, cases);
  failures.forEach((f) => console.log("FAIL " + f));
  console.log(`${cases.length - new Set(failures.map((f) => f.split('":')[0])).size}/${cases.length} advisor scenarios passed`);
  process.exit(failures.length ? 1 : 0);
}
