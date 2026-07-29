"""习惯追踪模型"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Habit(Base):
    """习惯表"""
    __tablename__ = "habits"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cadence: Mapped[str] = mapped_column(String(20), default="daily")
    color: Mapped[str] = mapped_column(String(20), default="#5B6CFF")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # JSON 数组:'YYYY-MM-DD' 字符串列表
    completed_dates: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, default="[]",
    )
