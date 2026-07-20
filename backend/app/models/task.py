"""任务数据模型"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Task(Base):
    """任务表"""
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reminder_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    priority: Mapped[str] = mapped_column(String(20), default="medium")
    status: Mapped[str] = mapped_column(String(30), default="todo")
    progress: Mapped[int] = mapped_column(Integer, default=0)

    category_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("categories.id"), nullable=True
    )
    project_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("projects.id"), nullable=True
    )

    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    estimated_time: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    actual_time: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    parent_task_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    is_starred: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    assignee_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # 复杂字段以 JSON 文本存储，降低早期 schema 复杂度
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")
    subtasks: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")
    attachments: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, default="[]"
    )
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")
    links: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")
    custom_fields: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, default="[]"
    )
    dependencies: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, default="[]"
    )
    blocked_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")
    checklist: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")


class Project(Base):
    """项目表"""
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#2563eb")
    icon: Mapped[str] = mapped_column(String(50), default="folder")
    status: Mapped[str] = mapped_column(String(30), default="active")

    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    parent_project_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    owner_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")


class Category(Base):
    """分类表"""
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#6b7280")
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    parent_category_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    project_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Tag(Base):
    """标签表"""
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    color: Mapped[str] = mapped_column(String(20), default="#6b7280")
    icon: Mapped[str] = mapped_column(String(50), default="label")
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)

    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
