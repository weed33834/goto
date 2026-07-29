"""Shared JSON/datetime utilities for API routes.

Eliminates 6 copies of _now() / _dump() / _load() across 5 API modules
(habits/goals/templates/vault/tasks), each ~15 lines = ~75 lines saved.
"""
import json
from datetime import datetime, timezone
from typing import Any


def utc_now() -> datetime:
    """Return current UTC datetime. Replaces 6 local _now()."""
    return datetime.now(timezone.utc)


def json_dump(value: Any, default_str: str = "[]") -> str:
    """Serialize to JSON string.  default_str: fallback when value is None."""
    if value is None:
        return default_str
    return json.dumps(value, ensure_ascii=False, default=str)


def json_load(value: str | None, default: Any = None) -> Any:
    """Deserialize JSON string.  default: fallback on None or parse failure."""
    if value is None:
        return default if default is not None else []
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return default if default is not None else []


def json_load_dict(value: str | None) -> dict[str, Any]:
    """Deserialize JSON string, default empty dict. Used by templates."""
    if value is None:
        return {}
    try:
        result = json.loads(value)
        return result if isinstance(result, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def json_load_nullable(value: str | None) -> Any | None:
    """Deserialize JSON string, default None. Used by vault.time_capsule."""
    if value is None:
        return None
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return None
