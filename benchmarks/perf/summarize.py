#!/usr/bin/env python3
"""Print a short summary of an AIPerf run. Reads profile_export_aiperf.json. Uses only the standard library.

Usage: uv run python summarize.py [artifact_dir ...]     (default: artifacts/speed)
"""
import json
import sys
from pathlib import Path


def load(folder: Path):
    report = json.loads((folder / "profile_export_aiperf.json").read_text())
    manifest_path = folder / "phase_manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    return report, manifest


def stat(report, metric, key):
    value = report.get(metric, {}).get(key)
    return None if value is None else float(value)


def fmt(value, digits=0):
    return "N/A" if value is None else f"{value:,.{digits}f}"


def pair(report, metric, digits=0, keys=("p50", "p90")):
    return " / ".join(fmt(stat(report, metric, k), digits) for k in keys)


def summarize(folder: Path) -> str:
    report, manifest = load(folder)
    config = report.get("input_config", {})
    model = config.get("models", {}).get("items", [{}])[0].get("name", "unknown")
    url = (config.get("endpoint", {}).get("urls") or ["unknown"])[0]
    phases = {p.get("kind"): p for p in config.get("phases", [])}
    profiling = phases.get("profiling", {})
    warmup = phases.get("warmup", {})
    prompts = (config.get("datasets") or [{}])[0].get("prompts", {})
    isl = prompts.get("isl", {}).get("mean")
    osl = prompts.get("osl", {}).get("mean")
    requests = int(profiling.get("requests", stat(report, "request_count", "avg") or 0))
    errors = next(
        (p.get("error_request_count") for p in manifest.get("phases", []) if p.get("phase_kind") == "profiling"),
        None,
    )
    percentiles = ("p50", "p90", "p99") if requests >= 100 else ("p50", "p90")
    label = " / ".join(percentiles)

    out_len = stat(report, "output_sequence_length", "avg")
    reasoning = stat(report, "reasoning_token_count", "avg")
    answer_count = report.get("time_to_first_output_token", {}).get("count")
    cache_read = stat(report, "usage_prompt_cache_read_tokens", "sum")

    lines = [
        f"Speed summary: {model} at {url}",
        f"Date: {str(report.get('start_time', 'unknown'))[:10]}   Tool: aiperf {report.get('aiperf_version', 'unknown')}",
        f"Test: {profiling.get('concurrency', '?')} client(s), ISL {fmt(isl)}, OSL {fmt(osl)}, "
        f"{requests} requests ({warmup.get('requests', 0)} warmup)",
        "",
        f"TTFT {label} (ms):".ljust(34) + pair(report, "time_to_first_token", 0, percentiles),
        "Inter-token latency p50 (ms):".ljust(34) + fmt(stat(report, "inter_token_latency", "p50"), 1),
        "Tokens/sec per user p50:".ljust(34) + fmt(stat(report, "output_token_throughput_per_user", "p50")),
        f"Request latency {label} (ms):".ljust(34) + pair(report, "request_latency", 0, percentiles),
        "Output sequence length (mean):".ljust(34) + fmt(out_len, 1),
        "Output throughput, all clients:".ljust(34) + fmt(stat(report, "output_token_throughput", "avg")) + " tokens/sec",
        "Request throughput:".ljust(34) + fmt(stat(report, "request_throughput", "avg"), 2) + " requests/sec",
        "Errors:".ljust(34) + f"{fmt(errors) if errors is not None else 'N/A'} of {requests}",
    ]

    notes = []
    if osl and out_len is not None and out_len < 0.95 * osl:
        notes.append(f"Output is much shorter than the {fmt(osl)} tokens that were requested. The server may ignore ignore_eos. Tokens/sec is not reliable.")
    if reasoning and out_len and reasoning / out_len > 0.5:
        notes.append(f"Reasoning model: about {reasoning / out_len:.0%} of the output tokens are thinking tokens. TTFT is the time to the first streamed token, and this can be a thinking token.")
    if answer_count is not None and answer_count < requests:
        notes.append(f"Only {answer_count} of {requests} requests reached an answer token (Time to First Output Token). The other requests used all tokens for thinking.")
    if cache_read:
        notes.append(f"The endpoint read {fmt(cache_read)} prompt tokens from its cache. TTFT may be too low for those requests.")
    if notes:
        lines += ["", "Notes:"] + [f"- {n}" for n in notes]
    return "\n".join(lines)


def main():
    folders = [Path(a) for a in sys.argv[1:]] or [Path("artifacts/speed")]
    for index, folder in enumerate(folders):
        if not (folder / "profile_export_aiperf.json").exists():
            sys.exit(f"No profile_export_aiperf.json in {folder}. Run a test first.")
        if index:
            print("\n" + "-" * 60 + "\n")
        print(summarize(folder))


if __name__ == "__main__":
    main()
