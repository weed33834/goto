"""OKR 目标 Pydantic schemas"""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class KeyResult(BaseModel):
    id: str
    title: str
    progress: float = 0.0
    target: float = 100.0
    unit: str = "%"


class GoalCreate(BaseModel):
    id: Optional[str] = None
    title: str
    description: Optional[str] = None
    period: str = ""
    status: str = "active"
    created_by: Optional[str] = None
    key_results: list[KeyResult] = []


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    period: Optional[str] = None
    status: Optional[str] = None
    key_results: Optional[list[KeyResult]] = None


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: Optional[str] = None
    period: str
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    key_results: list[Any] = []
