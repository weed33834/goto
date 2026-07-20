"""CRUD 通用工具：消除 router 层重复的查询/更新/ID 生成样板。"""
import secrets
from typing import Any, TypeVar

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


def generate_id(prefix: str) -> str:
    """生成带前缀的 URL 安全 ID（secrets.token_urlsafe，碰撞概率远低于毫秒时间戳）。"""
    return f"{prefix}_{secrets.token_urlsafe(8)}"


async def get_or_404(
    db: AsyncSession,
    model: type[T],
    pk: str,
    detail: str = "Resource not found",
) -> T:
    """按主键查询，不存在则抛 404。"""
    result = await db.execute(select(model).where(model.id == pk))  # type: ignore[attr-defined]
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail=detail)
    return obj


def apply_updates(
    obj: Any,
    updates: Any,
    json_fields: dict[str, Any] | None = None,
) -> None:
    """将 Pydantic update 模型的已设置字段应用到 ORM 对象。

    json_fields：字段名 → 序列化函数（如 ``{"tags": _dump}``），
    需特殊序列化的 JSON 文本列在此声明，其余字段直接 setattr。
    """
    json_fields = json_fields or {}
    for key, value in updates.model_dump(exclude_unset=True).items():
        if key in json_fields:
            setattr(obj, key, json_fields[key](value))
        elif hasattr(obj, key):
            setattr(obj, key, value)
