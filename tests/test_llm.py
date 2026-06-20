"""Tests for the LLM abstraction layer."""

import pytest

from identitysphere.core.llm import LLMClient


class TestLLMClient:
    def test_offline_mode_default(self):
        client = LLMClient()
        assert not client.is_online
        assert client.mode == "offline"

    def test_offline_response_returns_string(self):
        client = LLMClient()
        result = client.ask("System prompt", "User prompt")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_offline_response_contains_task(self):
        client = LLMClient()
        result = client.ask("System", "TASK: Explain risk\n---DATA---\nSome data\n---END---")
        assert "Explain risk" in result

    def test_offline_response_contains_data(self):
        client = LLMClient()
        result = client.ask("System", "TASK: Test\n---DATA---\nUser is admin on AWS\n---END---")
        assert "admin on AWS" in result

    def test_offline_response_contains_offline_note(self):
        client = LLMClient()
        result = client.ask("System", "TASK: Test\n---DATA---\ndata\n---END---")
        assert "offline mode" in result.lower() or "offline" in result.lower()

    def test_call_count_increments(self):
        client = LLMClient()
        assert client.call_count == 0
        client.ask("System", "User")
        assert client.call_count == 1
        client.ask("System", "User2")
        assert client.call_count == 2

    def test_online_mode_config(self):
        client = LLMClient({"copilot": {"mode": "online", "api_base": "http://localhost:8080/v1"}})
        assert client.is_online
        assert client.api_base == "http://localhost:8080/v1"

    def test_online_fallback_to_offline(self):
        client = LLMClient({"copilot": {"mode": "online", "api_key_env": "NONEXISTENT_KEY_12345"}})
        result = client.ask("System", "TASK: Test\n---DATA---\ndata\n---END---")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_offline_handles_no_markers(self):
        client = LLMClient()
        result = client.ask("System", "Just a plain question about identity risk")
        assert isinstance(result, str)
        assert "plain question" in result or "identity risk" in result or "IdentitySphere" in result

    def test_custom_model_config(self):
        client = LLMClient({"copilot": {"model": "claude-sonnet-4-6", "temperature": 0.1}})
        assert client.model == "claude-sonnet-4-6"
        assert client.temperature == 0.1
