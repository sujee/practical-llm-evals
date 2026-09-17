"""
Very simple example of calling a model on Nebius Token Factory
using both the Chat Completions API and the Responses API.

Prerequisites:
    uv sync

Set your API key in a .env file:
    NEBIUS_API_KEY=your_api_key_here
"""

import os
from dotenv import load_dotenv
from openai import OpenAI

MODEL = 'zai-org/GLM-5.3-Flash'

def get_client() -> OpenAI:
    """Return an OpenAI client configured for Nebius Token Factory."""
    load_dotenv()
    api_key = os.getenv("NEBIUS_API_KEY")
    if not api_key:
        raise RuntimeError(
            "NEBIUS_API_KEY not found. Set it in your environment or .env file."
        )

    return OpenAI(
       base_url="https://api.tokenfactory.nebius.com/v1",
        api_key=api_key,
    )


def chat_completions_example(client: OpenAI, model: str, question: str) -> str:
    """Call a model using the Chat Completions API."""
    completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": question},
        ],
        temperature=0.6,
    )
    return completion.choices[0].message.content or ""


def responses_api_example(client: OpenAI, model: str, question: str) -> str:
    """Call a model using the Responses API."""
    response = client.responses.create(
        model=model,
        instructions="You are a helpful assistant.",
        input=question,
        temperature=0.6,
    )
    return response.output_text or ""


def main() -> None:
    # Pick any model available in your Token Factory project.
    question = "What is the capital of France?"

    client = get_client()

    print("=== Chat Completions API ===")
    print(chat_completions_example(client, MODEL, question))
    print()

    print("=== Responses API ===")
    print(responses_api_example(client, MODEL, question))


if __name__ == "__main__":
    main()
