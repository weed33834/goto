"""习惯追踪 API"""
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
from app.schemas.habit import HabitCreate, HabitResponse, HabitUpdate
from app.utils.crud import apply_updates, generate_id, get_or_404
from app.utils.json_utils import json_dump, utc_now

router = APIRouter(prefix="/habits", tags=["habits"])


@router.get(
    "/",
    response_model=list[HabitResponse],
    summary="获取习惯列表",
    responses=_COMMON_RESPONSES,
)
async def list_habits(
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Habit)
    if not include_archived:
        stmt = stmt.where(Habit.archived.is_(False))
    stmt = stmt.order_by(Habit.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/",
    response_model=HabitResponse,
    status_code=201,
    summary="创建习惯",
    responses=_COMMON_RESPONSES,
)
async def create_habit(
    habit_in: HabitCreate, db: AsyncSession = Depends(get_db)
):
    now = utc_now()
    habit = Habit(
        id=habit_in.id or generate_id("habit"),
        **habit_in.model_dump(exclude={
            "id", "created_at", "updated_at", "completed_dates",
        }),
        completed_dates=json_dump(habit_in.completed_dates),
        created_at=now,
        updated_at=now,
    )
    db.add(habit)
    await db.commit()
    await db.refresh(habit)
    return habit


@router.get(
    "/{habit_id}",
    response_model=HabitResponse,
    summary="获取习惯详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_habit(
    habit_id: str, db: AsyncSession = Depends(get_db)
):
    return await get_or_404(db, Habit, habit_id, "Habit not found")


@router.patch(
    "/{habit_id}",
    response_model=HabitResponse,
    summary="更新习惯",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_habit(
    habit_id: str, updates: HabitUpdate, db: AsyncSession = Depends(get_db)
):
    habit = await get_or_404(db, Habit, habit_id, "Habit not found")
    apply_updates(habit, updates, json_fields={"completed_dates": json_dump})
    habit.updated_at = utc_now()
    await db.commit()
    await db.refresh(habit)
    return habit


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
