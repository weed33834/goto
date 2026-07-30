"""保险库模型"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class VaultItem(Base):
    """保险库条目表"""
    __tablename__ = "vault_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    type: Mapped[str] = mapped_column(String(20), default="password")
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)

    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # JSON 数组:VaultField[] (原生 JSON 类型)
    fields: Mapped[Optional[list]] = mapped_column(
        JSON, nullable=True, default=list,
    )
    # JSON 对象:TimeCapsuleMeta (nullable,原生 JSON 类型)
    time_capsule: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True, default=None,
    )
