"""
Stream a continuous flow of words from a model on Nebius Token Factory,
then print basic performance stats.

Forces a fixed-length output by setting min_tokens equal to max_output_tokens
and ignore_eos=true, and disables thinking.

Usage:
    uv run simple_speed_test.py [model]

Prerequisites:
    uv sync

Set your API key in a .env file:
    NEBIUS_API_KEY=your_api_key_here
"""

import argparse
import os
import sys
import time

from dotenv import load_dotenv
from openai import OpenAI

DEFAULT_MODEL = "zai-org/GLM-5.3-Flash"
PROMPT = (
    "Output lowercase English words separated by single spaces. "
    "Do not use punctuation or add any other text. "
    "Begin immediately and continue until stopped."
)
MAX_OUTPUT_TOKENS = 1024
MIN_OUTPUT_TOKENS = 1024
TEMPERATURE = 1.0
IGNORE_EOS = True
ENABLE_THINKING = False
BASE_URL = "https://api.tokenfactory.nebius.com/v1"


def get_client() -> OpenAI:
    """Return an OpenAI client configured for Nebius Token Factory."""
    load_dotenv()
    api_key = os.getenv("NEBIUS_API_KEY")
    if not api_key:
        raise RuntimeError(
            "NEBIUS_API_KEY not found. Set it in your environment or .env file."
        )

    return OpenAI(
        base_url=BASE_URL,
        api_key=api_key,
    )


def print_settings(model: str) -> None:
    print(f"testing model : {model}")
    print(f"endpoint      : {BASE_URL}")
    print("=== settings ===")
    print(f"prompt             : {PROMPT}")
    print(f"max tokens         : {MAX_OUTPUT_TOKENS}")
    print(f"min tokens         : {MIN_OUTPUT_TOKENS}")
    print(f"ignore eos         : {IGNORE_EOS}")
    print(f"thinking           : {'enabled' if ENABLE_THINKING else 'disabled'}")
    print(f"temperature        : {TEMPERATURE}")
    print()


def stream_words(client: OpenAI, model: str) -> None:
    """Stream words to stdout, then print basic stats."""
    print_settings(model)

    start = time.perf_counter()
    first_token_at = None

    result_parts: list[str] = []
    thinking_parts: list[str] = []
    usage = None

    stream = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": PROMPT}],
        max_tokens=MAX_OUTPUT_TOKENS,
        temperature=TEMPERATURE,
        stream=True,
        stream_options={"include_usage": True},
        extra_body={
            "min_tokens": MIN_OUTPUT_TOKENS,
            "ignore_eos": IGNORE_EOS,
            "chat_template_kwargs": {"enable_thinking": ENABLE_THINKING},
        },
    )

    for chunk in stream:
        if getattr(chunk, "usage", None):
            usage = chunk.usage
        if not chunk.choices:
            continue

        delta = chunk.choices[0].delta
        thinking = getattr(delta, "reasoning_content", None)
        content = delta.content

        if thinking or content:
            if first_token_at is None:
                first_token_at = time.perf_counter()

        if thinking:
            thinking_parts.append(thinking)
        if content:
            sys.stdout.write(content)
            sys.stdout.flush()
            result_parts.append(content)

    end = time.perf_counter()
    sys.stdout.write("\n")

    result_tokens, thinking_tokens = count_tokens(usage, result_parts, thinking_parts)
    elapsed = end - start
    ttft = (first_token_at - start) if first_token_at else elapsed
    gen_time = max(elapsed - ttft, 1e-9)

    print_stats(
        ttft=ttft,
        result_tokens=result_tokens,
        thinking_tokens=thinking_tokens,
        elapsed=elapsed,
        gen_time=gen_time,
    )


def count_tokens(
    usage, result_parts: list[str], thinking_parts: list[str]
) -> tuple[int, int]:
    """Return (result_tokens, thinking_tokens), preferring API usage."""
    if usage:
        thinking = 0
        details = getattr(usage, "completion_tokens_details", None)
        if details:
            thinking = getattr(details, "reasoning_tokens", 0) or 0
        total = usage.completion_tokens or 0
        return max(total - thinking, 0), thinking

    return len("".join(result_parts).split()), len("".join(thinking_parts).split())


def print_stats(
    ttft: float,
    result_tokens: int,
    thinking_tokens: int,
    elapsed: float,
    gen_time: float,
) -> None:
    total_tokens = result_tokens + thinking_tokens
    print()
    print("=== stats ===")
    print(f"time to first token : {ttft:.3f} s")
    print(f"thinking tokens     : {thinking_tokens}")
    print(f"result tokens       : {result_tokens}")
    print(f"tok/sec (with think): {total_tokens / gen_time:.2f}")
    print(f"tok/sec (no think)  : {result_tokens / gen_time:.2f}")
    print(f"test time           : {elapsed:.3f} s")


def main() -> None:
    parser = argparse.ArgumentParser(description="Stream a continuous flow of words.")
    parser.add_argument("model", nargs="?", default=DEFAULT_MODEL)
    args = parser.parse_args()

    stream_words(get_client(), args.model)


if __name__ == "__main__":
    main()
