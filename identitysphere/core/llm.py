"""LLM abstraction layer with OpenAI-compatible API support and offline fallback.

Architecture:
  ask_llm(system_prompt, user_prompt) -> str

  Online mode:  POST to any OpenAI-compatible /v1/chat/completions endpoint
                (OpenAI, Azure OpenAI, Ollama, LM Studio, vLLM, etc.)
  Offline mode: template-based text generation using structured data -
                no LLM call, deterministic output, zero latency, works
                anywhere without API keys.

The caller (copilot.py) always builds the full system + user prompt.
This module only handles transport. It never interprets identity data,
generates risk scores, or makes security decisions.

Config (settings.yaml -> copilot section):
  copilot:
    mode: "offline"          # "online" | "offline"
    api_base: "https://api.openai.com/v1"
    api_key_env: "OPENAI_API_KEY"
    model: "gpt-4o-mini"
    temperature: 0.3
    max_tokens: 1024
    timeout_seconds: 30
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("identitysphere.llm")


class LLMClient:
    """Thin wrapper around an OpenAI-compatible chat completions API."""

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        cfg = config or {}
        copilot_cfg = cfg.get("copilot", {})
        self.mode: str = copilot_cfg.get("mode", "offline")
        self.api_base: str = copilot_cfg.get("api_base", "https://api.openai.com/v1")
        self.api_key_env: str = copilot_cfg.get("api_key_env", "OPENAI_API_KEY")
        self.model: str = copilot_cfg.get("model", "gpt-4o-mini")
        self.temperature: float = copilot_cfg.get("temperature", 0.3)
        self.max_tokens: int = copilot_cfg.get("max_tokens", 1024)
        self.timeout: int = copilot_cfg.get("timeout_seconds", 30)
        self._call_count: int = 0

    def ask(self, system_prompt: str, user_prompt: str) -> str:
        """Send a chat completion request. Falls back to offline if online fails."""
        if self.mode == "online":
            try:
                return self._call_api(system_prompt, user_prompt)
            except Exception as exc:
                logger.warning("LLM API call failed (%s), falling back to offline", exc)
                return self._offline_response(system_prompt, user_prompt)
        return self._offline_response(system_prompt, user_prompt)

    def _call_api(self, system_prompt: str, user_prompt: str) -> str:
        """Make an actual HTTP call to the OpenAI-compatible endpoint."""
        import httpx

        api_key = os.environ.get(self.api_key_env, "")
        if not api_key:
            raise ValueError(f"Environment variable {self.api_key_env} not set")

        url = f"{self.api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }

        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(url, json=payload, headers=headers)
            response.raise_for_status()

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        self._call_count += 1
        logger.info("LLM API call #%d completed (%d chars)", self._call_count, len(content))
        return content.strip()

    def _offline_response(self, system_prompt: str, user_prompt: str) -> str:
        """Generate a deterministic response from the user prompt content.

        The offline fallback parses structured markers in the user_prompt
        (placed there by copilot.py) and assembles a coherent narrative
        without any LLM. This makes tests deterministic and the system
        deployable in air-gapped environments.
        """
        self._call_count += 1
        lines = user_prompt.strip().split("\n")

        task_line = ""
        data_lines: list[str] = []
        in_data = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("TASK:"):
                task_line = stripped[5:].strip()
            elif stripped == "---DATA---":
                in_data = True
            elif stripped == "---END---":
                in_data = False
            elif in_data:
                data_lines.append(stripped)

        if not task_line:
            task_line = lines[0] if lines else "analysis"

        body = "\n".join(data_lines) if data_lines else user_prompt[:500]

        return (
            f"[IdentitySphere AI - Offline Analysis]\n\n"
            f"Task: {task_line}\n\n"
            f"{body}\n\n"
            f"Note: This analysis was generated in offline mode using structured evidence "
            f"from IdentitySphere detectors, privilege calculator, behavioral engine, "
            f"and attack graph. For richer natural-language narratives, enable online mode "
            f"with an OpenAI-compatible API endpoint."
        )

    @property
    def call_count(self) -> int:
        return self._call_count

    @property
    def is_online(self) -> bool:
        return self.mode == "online"
