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


def _coerce_json(value: Any, default: Any) -> Any:
    """把存储值归一为 Python 对象。

    兼容两种来源:
    - 旧数据 / 手动编码:值是 JSON 字符串(可能双重编码),逐层 json.loads 直到不再是字符串。
    - 原生 JSON 列:值已被 SQLAlchemy 反序列化为 list / dict,直接返回。
    """
    if value is None or value == "":
        return default
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        cur: Any = value
        for _ in range(3):  # 最多解三层,足以覆盖双重编码的历史脏数据
            cur = cur.strip()
            if not cur or cur in ("null", "None"):
                return default
            try:
                cur = json.loads(cur)
            except (json.JSONDecodeError, TypeError):
                return cur if isinstance(cur, (list, dict)) else default
            if isinstance(cur, (list, dict)):
                return cur
        return cur if isinstance(cur, (list, dict)) else default
    return default


def json_load(value: str | None, default: Any = None) -> Any:
    """Deserialize JSON value (string OR already-parsed object)."""
    return _coerce_json(value, default if default is not None else [])


def json_load_dict(value: str | None) -> dict[str, Any]:
    """Deserialize JSON value to dict, default empty dict. Used by templates."""
    return _coerce_json(value, {})


def json_load_nullable(value: str | None) -> Any | None:
    """Deserialize JSON value, default None. Used by vault.time_capsule."""
    return _coerce_json(value, None)
