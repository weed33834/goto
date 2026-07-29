"""保险库 Pydantic schemas"""
import json
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class VaultField(BaseModel):
    name: str
    value: str
    sensitive: bool = False


class TimeCapsuleMeta(BaseModel):
    unlock_at: Optional[datetime] = None
    reveal_countdown: bool = False


class VaultItemCreate(BaseModel):
    id: Optional[str] = None
    type: str = "password"
    title: str
    is_hidden: bool = False
    created_by: Optional[str] = None
    fields: list[VaultField] = []
    time_capsule: Optional[TimeCapsuleMeta] = None


class VaultItemUpdate(BaseModel):
    type: Optional[str] = None
    title: Optional[str] = None
    is_hidden: Optional[bool] = None
    fields: Optional[list[VaultField]] = None
    time_capsule: Optional[TimeCapsuleMeta] = None  # type: ignore[assignment]


class VaultItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    title: str
    is_hidden: bool
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    fields: list[Any] = []
    time_capsule: Optional[Any] = None

    @field_validator("fields", mode="before")
    @classmethod
    def _parse_fields(cls, v: Any) -> list[Any]:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return []
        return v if v else []

    @field_validator("time_capsule", mode="before")
    @classmethod
    def _parse_time_capsule(cls, v: Any) -> Any | None:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v
