from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .inspect import detect_project
from .models import ProjectProfile
from .security import audit_project


DEFAULT_MODEL = "gpt-5-mini"


def generate_plan(root: str | Path, request: str, model: str | None = None) -> dict[str, Any]:
    """Generate a structured engineering plan without modifying project files."""
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("AI planning requires the optional dependency: pip install -e '.[llm]'") from exc

    if not os.getenv("OPENAI_API_KEY") or not os.getenv("OPENAI_API_BASE"):
        raise RuntimeError("AI planning requires OPENAI_API_KEY and OPENAI_API_BASE to be configured.")

    project_root = Path(root).expanduser().resolve()
    profile = detect_project(project_root)
    audit = audit_project(project_root)
    selected_model = model or os.getenv("UEA_MODEL", DEFAULT_MODEL)
    client = OpenAI()

    request_options: dict[str, Any] = {
        "model": selected_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are Universal Engineering Agent's planning engine. "
                    "Create a precise, conservative software engineering plan from the supplied project evidence. "
                    "Do not claim that files were changed or tests were run. "
                    "Prefer the smallest safe change, preserve unrelated work, identify risks, and include concrete validation."
                ),
            },
            {
                "role": "user",
                "content": json.dumps({
                    "request": request,
                    "project_profile": profile.to_dict(),
                    "security_baseline": audit.to_dict(),
                }, ensure_ascii=False),
            },
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "engineering_plan",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string"},
                        "assumptions": {"type": "array", "items": {"type": "string"}},
                        "steps": {"type": "array", "items": {"type": "string"}},
                        "validation": {"type": "array", "items": {"type": "string"}},
                        "risks": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["summary", "assumptions", "steps", "validation", "risks"],
                    "additionalProperties": False,
                },
            },
        },
    }
    if selected_model.startswith("gpt-"):
        request_options["max_completion_tokens"] = 3000
    else:
        request_options["max_tokens"] = 4000
    response = client.chat.completions.create(**request_options)
    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("The configured AI model returned an empty planning response.")
    try:
        result = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RuntimeError("The configured AI model returned invalid structured output.") from exc
    result["model"] = selected_model
    return result


def render_plan(plan: dict[str, Any], request: str, profile: ProjectProfile) -> str:
    lines = [
        "# Universal Engineering Agent — Engineering Plan",
        "",
        f"**Request:** {request}",
        f"**Project:** `{profile.root}`",
        f"**Planning model:** `{plan.get('model', 'unknown')}`",
        "",
        "## Summary",
        plan.get("summary", "No summary returned."),
        "",
        "## Assumptions",
    ]
    lines.extend(f"- {item}" for item in plan.get("assumptions", []))
    lines.extend(["", "## Execution steps"])
    lines.extend(f"{index}. {item}" for index, item in enumerate(plan.get("steps", []), start=1))
    lines.extend(["", "## Validation"])
    lines.extend(f"- {item}" for item in plan.get("validation", []))
    lines.extend(["", "## Risks and blockers"])
    lines.extend(f"- {item}" for item in plan.get("risks", []))
    lines.extend(["", "## Status", "This is a generated plan only. No application files were modified and no plan step is claimed as completed.", ""])
    return "\n".join(lines)


def generate_task(root: str | Path, request: str, model: str | None = None) -> dict[str, Any]:
    """Generate a bounded, exact-match change proposal for the internal workspace."""
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("AI task execution requires the optional dependency: pip install -e '.[llm]'") from exc

    if not os.getenv("OPENAI_API_KEY") or not os.getenv("OPENAI_API_BASE"):
        raise RuntimeError("AI task execution requires OPENAI_API_KEY and OPENAI_API_BASE to be configured.")

    from .inspect import iter_project_files, read_text

    project_root = Path(root).expanduser().resolve()
    profile = detect_project(project_root)
    audit = audit_project(project_root)
    selected_model = model or os.getenv("UEA_MODEL", DEFAULT_MODEL)
    context: list[dict[str, str]] = []
    for path in iter_project_files(project_root):
        if path.name.startswith(".") or path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".exe", ".dll"}:
            continue
        text = read_text(path)
        if not text or len(text) > 40_000:
            continue
        context.append({"file": str(path.relative_to(project_root)).replace("\\", "/"), "content": _redact_context(text)})
        if len(context) >= 80:
            break

    request_options: dict[str, Any] = {
        "model": selected_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an autonomous but conservative coding engineer. Generate a bounded change proposal for the supplied internal workspace. "
                    "Use exact old text in find and exact replacement text in replace. Only propose files present in the context. "
                    "Do not invent credentials. Prefer the smallest safe change. If the request cannot be safely implemented from the evidence, return no changes and explain the blocker."
                ),
            },
            {
                "role": "user",
                "content": json.dumps({
                    "request": request,
                    "project_profile": profile.to_dict(),
                    "security_baseline": audit.to_dict(),
                    "workspace_files": context,
                }, ensure_ascii=False),
            },
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "engineering_task",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string"},
                        "changes": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "file": {"type": "string"},
                                    "find": {"type": "string"},
                                    "replace": {"type": "string"},
                                    "expected_matches": {"type": "integer"},
                                },
                                "required": ["file", "find", "replace", "expected_matches"],
                                "additionalProperties": False,
                            },
                        },
                        "validation": {"type": "array", "items": {"type": "string"}},
                        "risks": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["summary", "changes", "validation", "risks"],
                    "additionalProperties": False,
                },
            },
        },
    }
    if selected_model.startswith("gpt-"):
        request_options["max_completion_tokens"] = 6000
    else:
        request_options["max_tokens"] = 7000
    response = OpenAI().chat.completions.create(**request_options)
    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("The configured AI model returned an empty task proposal.")
    try:
        result = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RuntimeError("The configured AI model returned invalid task JSON.") from exc
    result["model"] = selected_model
    return result


def _redact_context(text: str) -> str:
    import re

    patterns = [
        r"(?i)(api[_-]?key|secret|token|password)\s*([:=])\s*([\"']?)[^\s\"']{8,}",
        r"-----BEGIN [^-]+ PRIVATE KEY-----.*?-----END [^-]+ PRIVATE KEY-----",
    ]
    redacted = text
    for pattern in patterns:
        redacted = re.sub(pattern, lambda match: match.group(0)[: match.group(0).find(match.group(3)) + len(match.group(3))] + "<REDACTED>" if match.lastindex and match.lastindex >= 3 else "<REDACTED>", redacted, flags=re.MULTILINE | re.DOTALL)
    return redacted
