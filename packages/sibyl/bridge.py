#!/usr/bin/env python3
"""Thin JSON bridge from Engram's TypeScript runtime to Sibyl MemoryClient.

This intentionally uses only the public sibyl_memory_client.MemoryClient API.
The evaluated profile must not bypass Sibyl by reaching into its SQLite schema.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from sibyl_memory_client import MemoryClient


def _client() -> MemoryClient:
    path = Path(os.environ.get("ENGRAM_SIBYL_DB", "~/.sibyl-memory/engram-hackathon.db")).expanduser()
    tenant = os.environ.get("ENGRAM_SIBYL_TENANT", "engram-hackathon")
    return MemoryClient.local(path, tenant_id=tenant)


def _safe_get(memory: MemoryClient, category: str, name: str) -> dict[str, Any] | None:
    try:
        return memory.get_entity(category, name)
    except Exception as exc:
        if exc.__class__.__name__ == "NotFoundError":
            return None
        raise


def _entities(memory: MemoryClient, category: str, limit: int = 10000) -> list[dict[str, Any]]:
    return memory.list_entities(category=category, limit=limit)


def _body(row: dict[str, Any] | None) -> Any:
    return None if row is None else row.get("body")


def _put(memory: MemoryClient, category: str, name: str, body: dict[str, Any]) -> dict[str, Any]:
    row = memory.set_entity(category, name, body)
    memory.write_event(
        acted=[f"engram:{category}:write"],
        extra={"category": category, "name": name, "executionId": body.get("executionId") or body.get("id")},
    )
    return row


def handle(req: dict[str, Any]) -> Any:
    memory = _client()
    op = req["op"]
    args = req.get("args", {})

    if op == "put":
        return _put(memory, args["category"], args["name"], args["body"])
    if op == "get":
        return _body(_safe_get(memory, args["category"], args["name"]))
    if op == "list":
        rows = _entities(memory, args["category"], int(args.get("limit", 10000)))
        return [row["body"] for row in rows]
    if op == "search_memories":
        query = args["query"]
        limit = min(max(int(args.get("limit", 8)), 1), 50)
        agent_id = args["agentId"]
        # Ask Sibyl's documented WARM-tier FTS5 search for a larger pool, then
        # enforce Engram's agent boundary and result limit in the adapter.
        rows = memory.search_entities(query, category="operational_memory", limit=min(limit * 8, 400))
        out = []
        for row in rows:
            body = row.get("body") or {}
            if body.get("agentId") != agent_id:
                continue
            out.append({"memory": body, "sibyl": {"entityId": row.get("id"), "updatedAt": row.get("updated_at")}})
            if len(out) >= limit:
                break
        return out
    if op == "delete_memory":
        return memory.delete_entity("operational_memory", args["memoryId"])
    if op == "ping":
        return {"tenant": memory.get_tenant(), "schemaVersion": memory.schema_version()}
    raise ValueError(f"unsupported operation: {op}")


def main() -> None:
    try:
        req = json.load(sys.stdin)
        result = handle(req)
        json.dump({"ok": True, "result": result}, sys.stdout, default=str)
    except Exception as exc:
        json.dump({"ok": False, "error": {"type": exc.__class__.__name__, "message": str(exc)}}, sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
