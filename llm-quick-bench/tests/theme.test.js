const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..");
const themeSource = fs.readFileSync(path.join(projectRoot, "theme.js"), "utf8");

function runThemeScript(savedTheme = null) {
  const listeners = {};
  const toggle = {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
  const stored = new Map(savedTheme ? [["llm-quick-bench-theme", savedTheme]] : []);
  const documentElement = { dataset: { theme: "light" }, style: {} };
  const context = vm.createContext({
    document: {
      documentElement,
      querySelector: () => toggle,
    },
    localStorage: {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
    },
    Set,
  });

  vm.runInContext(themeSource, context);
  return { documentElement, listeners, stored, toggle };
}

test("theme toggle defaults to light and offers dark mode", () => {
  const state = runThemeScript();

  assert.equal(state.documentElement.dataset.theme, "light");
  assert.equal(state.documentElement.style.colorScheme, "light");
  assert.equal(state.toggle.attributes["aria-pressed"], "false");
  assert.equal(state.toggle.attributes["aria-label"], "Switch to dark theme");
});

test("theme toggle restores dark mode and persists its next selection", () => {
  const state = runThemeScript("dark");

  assert.equal(state.documentElement.dataset.theme, "dark");
  assert.equal(state.toggle.attributes["aria-pressed"], "true");
  assert.equal(state.toggle.attributes["aria-label"], "Switch to light theme");

  state.listeners.click();
  assert.equal(state.documentElement.dataset.theme, "light");
  assert.equal(state.stored.get("llm-quick-bench-theme"), "light");
});

test("theme toggle ignores an invalid saved preference", () => {
  const state = runThemeScript("sepia");

  assert.equal(state.documentElement.dataset.theme, "light");
  assert.equal(state.toggle.attributes["aria-pressed"], "false");
});
