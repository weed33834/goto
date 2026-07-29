"""习惯追踪 Pydantic schemas"""
import json
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class HabitCreate(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    cadence: str = "daily"
    color: str = "#5B6CFF"
    archived: bool = False
    created_by: Optional[str] = None
    completed_dates: list[str] = []


class HabitUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cadence: Optional[str] = None
    color: Optional[str] = None
    archived: Optional[bool] = None
    completed_dates: Optional[list[str]] = None


class HabitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str] = None
    cadence: str
    color: str
    archived: bool
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_dates: list[str] = []

    @field_validator("completed_dates", mode="before")
    @classmethod
    def _parse_completed(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return []
        return v if v else []
