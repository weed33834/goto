"""任务相关 Pydantic schemas"""
import json
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Subtask(BaseModel):
    id: str
    title: str
    completed: bool = False
    order: int = 0


class ChecklistItem(BaseModel):
    id: str
    text: str
    completed: bool = False
    completed_at: Optional[datetime] = None
    order: int = 0
    due_date: Optional[datetime] = None
    assignee_id: Optional[str] = None
    created_at: Optional[datetime] = None


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    content: Optional[str] = None
    due_date: Optional[datetime] = None
    due_time: Optional[datetime] = None
    start_date: Optional[datetime] = None
    start_time: Optional[datetime] = None
    end_date: Optional[datetime] = None
    reminder_date: Optional[datetime] = None
    # GTD 维度,与前端 EnergyLevel / TaskContext 对齐
    energy_level: Optional[Literal['low', 'medium', 'high']] = None
    context: Optional[str] = None
    # 重复规则 / 设备版本向量 / 地点,均以 Any 透传(JSON 文本存储)
    recurrence: Optional[Any] = None
    device_version: Optional[dict[str, int]] = None
    location: Optional[Any] = None
    # priority/status 枚举与移动端 (src/shared/types/index.ts) 及桌面端
    # (desktop/src/shared/types.ts) 对齐，三端一致。
    priority: Literal['low', 'medium', 'high', 'urgent', 'critical'] = "medium"
    status: Literal[
        'todo', 'in-progress', 'waiting', 'delegated',
        'completed', 'cancelled', 'on-hold'
    ] = "todo"
    progress: int = 0
    category_id: Optional[str] = None
    project_id: Optional[str] = None
    completed: bool = False
    completed_at: Optional[datetime] = None
    estimated_time: Optional[int] = None
    actual_time: Optional[int] = None
    is_recurring: bool = False
    parent_task_id: Optional[str] = None
    is_starred: bool = False
    is_hidden: bool = False
    is_archived: bool = False
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    assignee_id: Optional[str] = None
    created_by: Optional[str] = None
    order: int = 0
    version: int = 1
    tags: list[str] = Field(default_factory=list)
    subtasks: list[Subtask] = Field(default_factory=list)
    attachments: list[Any] = Field(default_factory=list)
    comments: list[Any] = Field(default_factory=list)
    links: list[Any] = Field(default_factory=list)
    custom_fields: list[Any] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    blocked_by: list[str] = Field(default_factory=list)
    notes: list[Any] = Field(default_factory=list)
    checklist: list[ChecklistItem] = Field(default_factory=list)


class TaskCreate(TaskBase):
    id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    due_date: Optional[datetime] = None
    due_time: Optional[datetime] = None
    start_date: Optional[datetime] = None
    start_time: Optional[datetime] = None
    end_date: Optional[datetime] = None
    reminder_date: Optional[datetime] = None
    energy_level: Optional[Literal['low', 'medium', 'high']] = None
    context: Optional[str] = None
    recurrence: Optional[Any] = None
    device_version: Optional[dict[str, int]] = None
    location: Optional[Any] = None
    priority: Optional[Literal['low', 'medium', 'high', 'urgent', 'critical']] = None
    status: Optional[
        Literal[
            'todo', 'in-progress', 'waiting', 'delegated',
            'completed', 'cancelled', 'on-hold'
        ]
    ] = None
    progress: Optional[int] = None
    category_id: Optional[str] = None
    project_id: Optional[str] = None
    completed: Optional[bool] = None
    completed_at: Optional[datetime] = None
    estimated_time: Optional[int] = None
    actual_time: Optional[int] = None
    is_recurring: Optional[bool] = None
    parent_task_id: Optional[str] = None
    is_starred: Optional[bool] = None
    is_hidden: Optional[bool] = None
    is_archived: Optional[bool] = None
    is_deleted: Optional[bool] = None
    deleted_at: Optional[datetime] = None
    assignee_id: Optional[str] = None
    created_by: Optional[str] = None
    order: Optional[int] = None
    tags: Optional[list[str]] = None
    subtasks: Optional[list[Subtask]] = None
    attachments: Optional[list[Any]] = None
    comments: Optional[list[Any]] = None
    links: Optional[list[Any]] = None
    custom_fields: Optional[list[Any]] = None
    dependencies: Optional[list[str]] = None
    blocked_by: Optional[list[str]] = None
    notes: Optional[list[Any]] = None
    checklist: Optional[list[ChecklistItem]] = None
    # 乐观锁：客户端传入期望的当前 version，服务端校验不一致则返回 409。
    # 不传时跳过校验，保持向后兼容。
    expected_version: Optional[int] = None


class TaskResponse(TaskBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    # JSON 文本列 → Python 对象自动解析，消除 13 字段手动 _load 映射
    _JSON_FIELDS = frozenset({
        "tags", "subtasks", "attachments", "comments", "links",
        "custom_fields", "dependencies", "blocked_by", "notes", "checklist",
        "recurrence", "device_version", "location",
    })

    @model_validator(mode="before")
    @classmethod
    def _parse_json_text_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        for field_name in cls._JSON_FIELDS:
            val = data.get(field_name)
            if isinstance(val, str):
                try:
                    data[field_name] = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    data[field_name] = None
        return data


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#2563eb"
    icon: str = "folder"
    status: str = "active"
    is_default: bool = False
    is_favorite: bool = False
    is_archived: bool = False
    parent_project_id: Optional[str] = None
    owner_id: Optional[str] = None
    task_count: int = 0
    completed_task_count: int = 0
    progress: int = 0
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    tags: list[str] = Field(default_factory=list)


class ProjectCreate(ProjectBase):
    id: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    status: Optional[str] = None
    is_default: Optional[bool] = None
    is_favorite: Optional[bool] = None
    is_archived: Optional[bool] = None
    parent_project_id: Optional[str] = None
    owner_id: Optional[str] = None
    task_count: Optional[int] = None
    completed_task_count: Optional[int] = None
    progress: Optional[int] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    tags: Optional[list[str]] = None


class ProjectResponse(ProjectBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def _parse_tags(cls, data: Any) -> Any:
        if isinstance(data, dict) and isinstance(data.get("tags"), str):
            try:
                data["tags"] = json.loads(data["tags"])
            except (json.JSONDecodeError, TypeError):
                data["tags"] = []
        return data


class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#6b7280"
    icon: Optional[str] = None
    is_system: bool = False
    is_archived: bool = False
    parent_category_id: Optional[str] = None
    project_id: Optional[str] = None
    order: int = 0


class CategoryCreate(CategoryBase):
    id: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_system: Optional[bool] = None
    is_archived: Optional[bool] = None
    parent_category_id: Optional[str] = None
    project_id: Optional[str] = None
    order: Optional[int] = None


class CategoryResponse(CategoryBase):
    id: str
    created_at: datetime
    updated_at: datetime
    # 由 tasks 路由聚合查询填入，未传时退回 0（兼容老客户端）。
    # 与前端 desktop/src/shared/types.ts Category.taskCount 字段对齐。
    task_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class TagBase(BaseModel):
    name: str
    color: str = "#6b7280"
    icon: str = "label"
    is_system: bool = False
    usage_count: int = 0
    created_by: Optional[str] = None


class TagCreate(TagBase):
    id: Optional[str] = None


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    # is_system / usage_count 之前缺失,导致前端 Tag 类型中 isSystem / usageCount
    # 字段无法通过 PATCH 修改或同步（B-5）。usage_count 主要由后端在任务增删时
    # 自动维护,但允许管理员手动校正（例如导入数据后回填）。
    is_system: Optional[bool] = None
    usage_count: Optional[int] = None
    created_by: Optional[str] = None


class TagResponse(TagBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
