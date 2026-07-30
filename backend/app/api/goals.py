"""OKR 目标 API"""
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
from app.schemas.goal import GoalCreate, GoalResponse, GoalUpdate
from app.utils.crud import apply_updates, generate_id, get_or_404
from app.utils.json_utils import utc_now

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get(
    "/",
    response_model=list[GoalResponse],
    summary="获取目标列表",
    responses=_COMMON_RESPONSES,
)
async def list_goals(
    status: str | None = Query(None, description="按状态过滤"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Goal)
    if status is not None:
        stmt = stmt.where(Goal.status == status)
    stmt = stmt.order_by(Goal.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/",
    response_model=GoalResponse,
    status_code=201,
    summary="创建目标",
    responses=_COMMON_RESPONSES,
)
async def create_goal(
    goal_in: GoalCreate, db: AsyncSession = Depends(get_db)
):
    now = utc_now()
    goal = Goal(
        id=goal_in.id or generate_id("goal"),
        **goal_in.model_dump(exclude={
            "id", "created_at", "updated_at", "key_results",
        }),
        key_results=[kr.model_dump() for kr in goal_in.key_results],
        created_at=now,
        updated_at=now,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.get(
    "/{goal_id}",
    response_model=GoalResponse,
    summary="获取目标详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_goal(
    goal_id: str, db: AsyncSession = Depends(get_db)
):
    return await get_or_404(db, Goal, goal_id, "Goal not found")


@router.patch(
    "/{goal_id}",
    response_model=GoalResponse,
    summary="更新目标",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_goal(
    goal_id: str, updates: GoalUpdate, db: AsyncSession = Depends(get_db)
):
    goal = await get_or_404(db, Goal, goal_id, "Goal not found")

    apply_updates(goal, updates)
    goal.updated_at = utc_now()
    await db.commit()
    await db.refresh(goal)
    return goal


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
