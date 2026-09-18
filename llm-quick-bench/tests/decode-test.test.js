const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const benchSource = fs.readFileSync(path.join(projectRoot, "bench-utils.js"), "utf8");
const decodeSource = fs.readFileSync(path.join(projectRoot, "decode-test1.js"), "utf8");

test("Decode Test tab, panel, and script are wired into the page", () => {
  assert.match(html, /id="decode-test-tab"[\s\S]*aria-controls="decode-test-panel"/);
  assert.match(html, /id="decode-test-panel"[\s\S]*aria-labelledby="decode-test-tab"/);
  assert.match(html, /<script src="bench-utils\.js" defer><\/script>/);
  assert.match(html, /<script src="decode-test1\.js" defer><\/script>/);

  // decode-test1.js reads globals owned by speed-test1.js/thinking-test1.js at
  // load time, so all four scripts must execute in this exact order.
  const scriptOrder = ["bench-utils.js", "speed-test1.js", "thinking-test1.js", "decode-test1.js"]
    .map((name) => ({ name, index: html.indexOf(`<script src="${name}"`) }));
  scriptOrder.forEach(({ name, index }) => assert.ok(index !== -1, `Missing script ${name}`));
  for (let i = 1; i < scriptOrder.length; i += 1) {
    assert.ok(
      scriptOrder[i].index > scriptOrder[i - 1].index,
      `${scriptOrder[i].name} must load after ${scriptOrder[i - 1].name}`,
    );
  }
});

test("Decode Test runs three fixed output lengths and shows the required prompt", () => {
  const panel = html.slice(html.indexOf('id="decode-test-panel"'));
  assert.match(panel, /100 · 500 · 1000 tokens/);
  assert.match(panel, /Generate a continuous stream of lowercase English words separated by single spaces\./);
  assert.match(panel, /id="decode-disable-thinking"[^>]*checked/);
  assert.match(panel, /id="decode-fixed-output"[^>]*checked/);

  assert.match(decodeSource, /const DECODE_OUTPUT_TOKEN_OPTIONS = \[100, 500, 1000\];/);
  assert.match(decodeSource, /runs: runsPerConfig \* DECODE_OUTPUT_TOKEN_OPTIONS\.length/);
  assert.match(decodeSource, /outputTokenLengths: \[\.\.\.DECODE_OUTPUT_TOKEN_OPTIONS\]/);
});

test("Decode Test defaults to five runs per output length", () => {
  const panel = html.slice(html.indexOf('id="decode-test-panel"'));
  assert.match(panel, /id="decode-runs"[^>]*value="5"/);
  assert.match(decodeSource, /clampInteger\(decodeRunsInput\.value, 1, 20\)/);
});

test("every DOM id referenced by decode-test1.js exists in index.html", () => {
  const referencedIds = [...decodeSource.matchAll(/querySelector\("#([a-z0-9-]+)"\)/gi)]
    .map((match) => match[1]);
  const uniqueIds = [...new Set(referencedIds)];
  assert.ok(uniqueIds.length > 10);
  uniqueIds.forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`), `Missing #${id} in index.html`);
  });
});

test("Decode Test uses the shared helpers extracted into bench-utils", () => {
  const extracted = [
    "buildDecodeMeasurement",
    "buildDecodeMatrixRows",
    "buildDecodeRunRows",
    "decodeGroupStatus",
    "decodeOutputTokensForRun",
    "splitCompletionTokens",
    "summarizeDecodeRuns",
  ];
  extracted.forEach((name) => {
    assert.match(benchSource, new RegExp(`function ${name}\\(`), `${name} should live in bench-utils.js`);
    assert.doesNotMatch(
      decodeSource,
      new RegExp(`function ${name}\\(`),
      `${name} should not be redefined in decode-test1.js`,
    );
  });
});

test("Decode Test never re-enables disabled fields and always releases the capture slot", () => {
  // The read-only output-lengths input must stay disabled after a run.
  assert.match(decodeSource, /filter\(\(control\) => !control\.disabled && !control\.readOnly\)/);
  // The sample-capture reservation is released even when a request throws.
  assert.match(decodeSource, /finally \{[\s\S]{0,200}decodeSampleCapturePending = false/);
});
