(() => {
  const storageKey = "llm-quick-bench-theme";
  const validThemes = new Set(["light", "dark"]);
  const root = document.documentElement;
  const themeToggle = document.querySelector("[data-theme-toggle]");

  const applyTheme = (theme, persist = false) => {
    const nextTheme = validThemes.has(theme) ? theme : "light";
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;

    const nextAction = nextTheme === "dark" ? "light" : "dark";
    themeToggle?.setAttribute("aria-label", `Switch to ${nextAction} theme`);
    themeToggle?.setAttribute("title", `Switch to ${nextAction} theme`);
    themeToggle?.setAttribute("aria-pressed", String(nextTheme === "dark"));

    if (persist) {
      try {
        localStorage.setItem(storageKey, nextTheme);
      } catch {
        // Theme selection still works when storage is unavailable.
      }
    }
  };

  let savedTheme = "light";
  try {
    savedTheme = localStorage.getItem(storageKey) || "light";
  } catch {
    // Use the light default when storage is unavailable.
  }

  applyTheme(savedTheme);

  themeToggle?.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
  });
})();
