"""习惯追踪 API"""
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import (
    COMMON_RESPONSES as _COMMON_RESPONSES,
)
from app.api import (
    DELETE_RESPONSES as _DELETE_RESPONSES,
)
from app.api import (
    NOT_FOUND_RESPONSES as _NOT_FOUND_RESPONSES,
)
from app.database import get_db
from app.models.habit import Habit
from app.schemas.habit import (
    HabitCreate,
    HabitResponse,
    HabitUpdate,
)
from app.utils.crud import apply_updates, generate_id, get_or_404

router = APIRouter(prefix="/habits", tags=["habits"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dump(value: Any) -> str:
    if value is None:
        return "[]"
    return json.dumps(value, ensure_ascii=False, default=str)


def _load(value: str | None) -> list[str]:
    if value is None:
        return []
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return []


def _habit_to_response(habit: Habit) -> dict[str, Any]:
    return {
        "id": habit.id,
        "name": habit.name,
        "description": habit.description,
        "cadence": habit.cadence,
        "color": habit.color,
        "archived": habit.archived,
        "created_by": habit.created_by,
        "created_at": habit.created_at,
        "updated_at": habit.updated_at,
        "completed_dates": _load(habit.completed_dates),
    }


@router.get(
    "/",
    response_model=list[HabitResponse],
    summary="获取习惯列表",
    responses=_COMMON_RESPONSES,
)
async def list_habits(
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    stmt = select(Habit)
    if not include_archived:
        stmt = stmt.where(Habit.archived.is_(False))
    stmt = stmt.order_by(Habit.created_at.desc())
    result = await db.execute(stmt)
    return [_habit_to_response(h) for h in result.scalars().all()]


@router.post(
    "/",
    response_model=HabitResponse,
    status_code=201,
    summary="创建习惯",
    responses=_COMMON_RESPONSES,
)
async def create_habit(
    habit_in: HabitCreate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    now = _now()
    habit = Habit(
        id=habit_in.id or generate_id("habit"),
        **habit_in.model_dump(exclude={
            "id", "created_at", "updated_at", "completed_dates",
        }),
        completed_dates=_dump(habit_in.completed_dates),
        created_at=now,
        updated_at=now,
    )
    db.add(habit)
    await db.commit()
    await db.refresh(habit)
    return _habit_to_response(habit)


@router.get(
    "/{habit_id}",
    response_model=HabitResponse,
    summary="获取习惯详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_habit(
    habit_id: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    habit = await get_or_404(db, Habit, habit_id, "Habit not found")
    return _habit_to_response(habit)


@router.patch(
    "/{habit_id}",
    response_model=HabitResponse,
    summary="更新习惯",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_habit(
    habit_id: str, updates: HabitUpdate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    habit = await get_or_404(db, Habit, habit_id, "Habit not found")
    apply_updates(habit, updates, json_fields={"completed_dates": _dump})
    habit.updated_at = _now()
    await db.commit()
    await db.refresh(habit)
    return _habit_to_response(habit)


@router.delete(
    "/{habit_id}",
    response_model=None,
    status_code=204,
    summary="删除习惯",
    responses=_DELETE_RESPONSES,
)
async def delete_habit(
    habit_id: str, db: AsyncSession = Depends(get_db)
) -> None:
    habit = await get_or_404(db, Habit, habit_id, "Habit not found")
    await db.delete(habit)
    await db.commit()
    return None
