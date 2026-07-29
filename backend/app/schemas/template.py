"""任务模板 Pydantic schemas"""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class TemplateCreate(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    is_built_in: bool = False
    created_by: Optional[str] = None
    task_defaults: dict[str, Any] = {}
    variables: list[str] = []


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_built_in: Optional[bool] = None
    usage_count: Optional[int] = None
    last_used_at: Optional[datetime] = None
    task_defaults: Optional[dict[str, Any]] = None
    variables: Optional[list[str]] = None


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str] = None
    is_built_in: bool
    usage_count: int
    last_used_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    task_defaults: Any = {}
    variables: list[Any] = []
