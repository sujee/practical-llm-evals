const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..");

test("application version is a positive integer and renders in the header", () => {
  const source = fs.readFileSync(path.join(projectRoot, "version.js"), "utf8");
  const versionElement = { textContent: "" };
  const context = vm.createContext({
    document: {
      querySelector: (selector) => (selector === "#app-version" ? versionElement : null),
    },
  });
  vm.runInContext(`${source}\nthis.__version = LLM_QUICK_BENCH_VERSION;`, context);

  assert.equal(Number.isInteger(context.__version), true);
  assert.ok(context.__version > 0);
  assert.equal(versionElement.textContent, `v${context.__version}`);

  const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  assert.match(html, /<script src="version\.js" defer><\/script>/);
  assert.match(html, /id="app-version"/);
});

test("repository instructions require a version bump and main-only publishing", () => {
  const instructions = fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8");
  assert.match(instructions, /Every commit must increment the version by exactly one\./);
  assert.match(instructions, /Use integers only/);
  assert.match(instructions, /Publishing happens only from the `main` branch/);
  assert.match(instructions, /Push `main` to `origin`\./);
});
