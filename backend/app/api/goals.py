"""OKR 目标 API"""
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
from app.models.goal import Goal
from app.schemas.goal import (
    GoalCreate,
    GoalResponse,
    GoalUpdate,
)
from app.utils.crud import apply_updates, generate_id, get_or_404

router = APIRouter(prefix="/goals", tags=["goals"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dump(value: Any) -> str:
    if value is None:
        return "[]"
    return json.dumps(value, ensure_ascii=False, default=str)


def _load(value: str | None) -> list[dict[str, Any]]:
    if value is None:
        return []
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return []


def _goal_to_response(goal: Goal) -> dict[str, Any]:
    return {
        "id": goal.id,
        "title": goal.title,
        "description": goal.description,
        "period": goal.period,
        "status": goal.status,
        "created_by": goal.created_by,
        "created_at": goal.created_at,
        "updated_at": goal.updated_at,
        "key_results": _load(goal.key_results),
    }


@router.get(
    "/",
    response_model=list[GoalResponse],
    summary="获取目标列表",
    responses=_COMMON_RESPONSES,
)
async def list_goals(
    status: str | None = Query(None, description="按状态过滤"),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    stmt = select(Goal)
    if status is not None:
        stmt = stmt.where(Goal.status == status)
    stmt = stmt.order_by(Goal.created_at.desc())
    result = await db.execute(stmt)
    return [_goal_to_response(g) for g in result.scalars().all()]


@router.post(
    "/",
    response_model=GoalResponse,
    status_code=201,
    summary="创建目标",
    responses=_COMMON_RESPONSES,
)
async def create_goal(
    goal_in: GoalCreate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    now = _now()
    goal = Goal(
        id=goal_in.id or generate_id("goal"),
        **goal_in.model_dump(exclude={
            "id", "created_at", "updated_at", "key_results",
        }),
        key_results=_dump(
            [kr.model_dump() for kr in goal_in.key_results]
        ),
        created_at=now,
        updated_at=now,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return _goal_to_response(goal)


@router.get(
    "/{goal_id}",
    response_model=GoalResponse,
    summary="获取目标详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_goal(
    goal_id: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    goal = await get_or_404(db, Goal, goal_id, "Goal not found")
    return _goal_to_response(goal)


@router.patch(
    "/{goal_id}",
    response_model=GoalResponse,
    summary="更新目标",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_goal(
    goal_id: str, updates: GoalUpdate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    goal = await get_or_404(db, Goal, goal_id, "Goal not found")
    json_fields = {
        "key_results": lambda v: _dump(
            [kr.model_dump() for kr in v] if v and hasattr(v[0], "model_dump") else v
        ),
    }
    apply_updates(goal, updates, json_fields=json_fields)
    goal.updated_at = _now()
    await db.commit()
    await db.refresh(goal)
    return _goal_to_response(goal)


@router.delete(
    "/{goal_id}",
    response_model=None,
    status_code=204,
    summary="删除目标",
    responses=_DELETE_RESPONSES,
)
async def delete_goal(
    goal_id: str, db: AsyncSession = Depends(get_db)
) -> None:
    goal = await get_or_404(db, Goal, goal_id, "Goal not found")
    await db.delete(goal)
    await db.commit()
    return None
