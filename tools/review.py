#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Code review orchestrator for Investigative Interviewing Demo.
Runs three sub-agents in parallel: security, code quality, and API/integration.

Usage:
    python tools/review.py <file>

Setup:
    pip install anthropic
    export ANTHROPIC_API_KEY=your_key_here
"""

import sys
import os
import asyncio
import anthropic
from pathlib import Path

# Load API key from project .env if not already in environment.
# Supports both ANTHROPIC_API_KEY and the project's CLAUDE_API_KEY alias.
if not os.environ.get("ANTHROPIC_API_KEY"):
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        env_vars: dict[str, str] = {}
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env_vars[k.strip()] = v.strip()
        api_key = env_vars.get("ANTHROPIC_API_KEY") or env_vars.get("CLAUDE_API_KEY")
        if api_key:
            os.environ["ANTHROPIC_API_KEY"] = api_key

client = anthropic.Anthropic()
MODEL = "claude-opus-4-6"


def read_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        print(f"Error reading {path}: {e}")
        sys.exit(1)


def run_agent(system_prompt: str, file_path: str, code: str) -> str:
    """Run a single review sub-agent synchronously."""
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": f"Review this file: {file_path}\n\n```\n{code}\n```",
            }
        ],
    )
    for block in response.content:
        if block.type == "text":
            return block.text
    return "(no output)"


# ── Sub-agent system prompts ──────────────────────────────────────────────────

SECURITY_PROMPT = """You are a security-focused code reviewer for a Node.js/Express web application
that handles audio file uploads, calls the Anthropic Claude API, ElevenLabs voice API,
OpenAI Whisper API, and the NZ legislation.govt.nz API.

Review the file for:
- Input validation and sanitisation (file uploads, user-submitted data)
- Injection vulnerabilities (command, SQL, path traversal)
- Unsafe use of user input in API calls or file paths
- Hardcoded secrets or credentials
- Insecure error messages that leak implementation details
- Missing authentication or authorisation checks on routes

Format your response as:
## Security Review
**Score: X/10**

### Issues Found
For each issue:
- **[HIGH/MEDIUM/LOW]** Line N: <issue description>
  - Fix: <specific recommendation>

### No Issues Found In
<list areas that look clean>

Be concise. Only flag real, exploitable issues — not theoretical best practices."""


QUALITY_PROMPT = """You are a code quality reviewer for a Node.js/Express web application.
The project uses ES modules (import/export), async/await, Express routing, multer for file uploads,
Server-Sent Events for progress streaming, and vanilla JS on the frontend.

Review the file for:
- Bugs or logic errors (off-by-one, wrong conditions, broken async flows)
- Error handling gaps (unhandled rejections, missing try/catch, silent failures)
- Resource leaks (unclosed streams, files not cleaned up)
- Dead code or unreachable branches
- Misleading variable names or confusing logic
- Unnecessary complexity that could be simplified

Format your response as:
## Code Quality Review
**Score: X/10**

### Issues Found
For each issue:
- **[BUG/WARNING/STYLE]** Line N: <issue description>
  - Fix: <specific recommendation>

### Looks Good
<list areas with no concerns>

Be concise. Focus on bugs and real problems, not stylistic preferences."""


API_PROMPT = """You are an API integration reviewer for a Node.js app that integrates with:
- Anthropic Claude API (@anthropic-ai/sdk) — used for claim extraction and interview critique
- OpenAI Whisper API — used for audio transcription via fetch()
- ElevenLabs API — used for voice synthesis and session management
- legislation.govt.nz REST API — used to verify NZ legislative claims

Review the file for:
- Missing error handling on API calls (unhandled 4xx/5xx, network failures)
- No retry logic where it would be appropriate (rate limits, transient errors)
- API keys or credentials used incorrectly (missing env var checks)
- Responses not validated before use (accessing undefined fields)
- Large payloads sent to APIs without size checks
- Streaming responses not handled correctly
- Race conditions in async flows

Format your response as:
## API & Integration Review
**Score: X/10**

### Issues Found
For each issue:
- **[ERROR/WARNING/IMPROVEMENT]** Line N: <issue description>
  - Fix: <specific recommendation>

### Looks Good
<list integrations or patterns that are handled well>

Be concise. Focus on things that will cause real failures in production."""


# ── Orchestrator ──────────────────────────────────────────────────────────────

async def run_all_agents(file_path: str, code: str):
    """Run all three agents in parallel using asyncio threads."""
    loop = asyncio.get_event_loop()

    tasks = [
        loop.run_in_executor(None, run_agent, SECURITY_PROMPT, file_path, code),
        loop.run_in_executor(None, run_agent, QUALITY_PROMPT, file_path, code),
        loop.run_in_executor(None, run_agent, API_PROMPT, file_path, code),
    ]

    labels = ["Security", "Code Quality", "API & Integration"]
    results = await asyncio.gather(*tasks)
    return list(zip(labels, results))


def extract_score(text: str) -> int:
    """Pull the X/10 score out of an agent response."""
    import re
    match = re.search(r"Score:\s*(\d+)/10", text)
    return int(match.group(1)) if match else 0


def print_divider(char="─", width=72):
    print(char * width)


def main():
    if len(sys.argv) < 2:
        print("Usage: python tools/review.py <file>")
        sys.exit(1)

    file_path = sys.argv[1]
    code = read_file(file_path)

    print()
    print_divider("═")
    print(f"  Code Review: {file_path}")
    print_divider("═")
    print("  Running 3 agents in parallel (security · quality · API)…")
    print_divider()
    print()

    results = asyncio.run(run_all_agents(file_path, code))

    scores = []
    for label, output in results:
        print_divider("─")
        print(f"  {label} Agent")
        print_divider("─")
        print(output.strip())
        print()
        scores.append(extract_score(output))

    print_divider("═")
    if scores:
        avg = sum(scores) / len(scores)
        score_line = "  | ".join(
            f"{label}: {s}/10"
            for (label, _), s in zip(results, scores)
        )
        print(f"  {score_line}")
        print(f"  Overall average: {avg:.1f}/10")
    print_divider("═")
    print()


if __name__ == "__main__":
    main()
