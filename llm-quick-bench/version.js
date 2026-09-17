const LLM_QUICK_BENCH_VERSION = 7;

const appVersionElement = document.querySelector("#app-version");
if (appVersionElement) {
  appVersionElement.textContent = `v${LLM_QUICK_BENCH_VERSION}`;
}
