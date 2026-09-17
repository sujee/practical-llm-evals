"""Check which Nebius Token Factory models support Chat and Responses APIs.
Runs all models in parallel. Prints markdown output."""

import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Callable

from dotenv import load_dotenv
from openai import OpenAI

BASE_URL = "https://api.tokenfactory.nebius.com/v1/"
MAX_WORKERS = 8
MAX_TOKENS = 16


@dataclass
class ModelResult:
    id: str
    chat_ok: bool
    chat_ms: float
    responses_ok: bool
    responses_ms: float
    chat_err: str = ""
    responses_err: str = ""


def get_client() -> OpenAI:
    """Return an OpenAI client configured for Nebius Token Factory."""
    load_dotenv()
    api_key = os.getenv("NEBIUS_API_KEY")
    if not api_key:
        raise RuntimeError("Set NEBIUS_API_KEY in your environment or .env file.")
    return OpenAI(base_url=BASE_URL, api_key=api_key, timeout=30.0)


def timed_call(call: Callable[[], object]) -> tuple[bool, float, str]:
    """Run call(), returning (ok, elapsed_ms, error_message)."""
    start = time.perf_counter()
    try:
        call()
        return True, (time.perf_counter() - start) * 1000, ""
    except Exception as e:
        elapsed = (time.perf_counter() - start) * 1000
        message = getattr(e, "message", None) or str(e)
        return False, elapsed, message


def check_model(client: OpenAI, model: str) -> ModelResult:
    chat_ok, chat_ms, chat_err = timed_call(
        lambda: client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=MAX_TOKENS,
        )
    )
    responses_ok, responses_ms, responses_err = timed_call(
        lambda: client.responses.create(
            model=model,
            input="Hi",
            max_output_tokens=MAX_TOKENS,
        )
    )
    return ModelResult(
        id=model,
        chat_ok=chat_ok,
        chat_ms=chat_ms,
        responses_ok=responses_ok,
        responses_ms=responses_ms,
        chat_err=chat_err,
        responses_err=responses_err,
    )


def print_table(results: list[ModelResult]) -> None:
    model_width = max((len(r.id) for r in results), default=5)
    status_width = 5

    print()
    print(
        f"| {'Model':<{model_width}} | "
        f"{'Chat':^{status_width}} | "
        f"{'Responses':^{status_width}} |"
    )
    print(
        f"| {'-' * model_width} | "
        f"{'-' * status_width}: | "
        f"{'-' * status_width}: |"
    )

    for r in results:
        chat_status = "✅" if r.chat_ok else "❌"
        resp_status = "✅" if r.responses_ok else "❌"
        print(
            f"| {r.id:<{model_width}} | "
            f"{chat_status:^{status_width}} | "
            f"{resp_status:^{status_width}} |"
        )

    chat = sum(1 for r in results if r.chat_ok)
    resp = sum(1 for r in results if r.responses_ok)
    print()
    print(f"**Summary:** {chat}/{len(results)} chat, {resp}/{len(results)} responses")


def print_errors(results: list[ModelResult]) -> None:
    errors = [
        (r.id, "chat", r.chat_err) for r in results if not r.chat_ok and r.chat_err
    ]
    errors += [
        (r.id, "responses", r.responses_err)
        for r in results
        if not r.responses_ok and r.responses_err
    ]
    if not errors:
        return

    print()
    print("**Errors:**")
    for model_id, api, err in errors:
        print(f"- {model_id} [{api}]: {err}")


def main() -> None:
    client = get_client()
    start_run = time.perf_counter()

    models = [m.id for m in client.models.list() if "embedding" not in m.id.lower()]
    models.sort(key=str.lower)

    if not models:
        print("No non-embedding models found.")
        return

    print(f"Checking {len(models)} model(s) in parallel...")

    results: list[ModelResult] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(check_model, client, m) for m in models]
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            if result.chat_ok and result.responses_ok:
                status = "OK"
            elif result.chat_ok or result.responses_ok:
                status = "PARTIAL"
            else:
                status = "FAIL"
            print(f"  {result.id}: {status}")

    results.sort(key=lambda r: r.id.lower())
    total_s = time.perf_counter() - start_run

    print_table(results)
    print(f"**Total time:** {total_s:.1f}s")
    print_errors(results)


if __name__ == "__main__":
    main()
