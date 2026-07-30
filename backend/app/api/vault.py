"""保险库 API"""
from fastapi import APIRouter, Depends
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
from app.models.vault import VaultItem
from app.schemas.vault import VaultItemCreate, VaultItemResponse, VaultItemUpdate
from app.utils.crud import apply_updates, generate_id, get_or_404
from app.utils.json_utils import utc_now

router = APIRouter(prefix="/vault", tags=["vault"])



@router.get(
    "/",
    response_model=list[VaultItemResponse],
    summary="获取保险库条目列表",
    responses=_COMMON_RESPONSES,
)
async def list_vault_items(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VaultItem).order_by(VaultItem.created_at.desc())
    )
    return result.scalars().all()


@router.post(
    "/",
    response_model=VaultItemResponse,
    status_code=201,
    summary="创建保险库条目",
    responses=_COMMON_RESPONSES,
)
async def create_vault_item(
    item_in: VaultItemCreate, db: AsyncSession = Depends(get_db)
):
    now = utc_now()
    item = VaultItem(
        id=item_in.id or generate_id("vault"),
        **item_in.model_dump(exclude={
            "id", "created_at", "updated_at", "fields", "time_capsule",
        }),
        fields=[f.model_dump() for f in item_in.fields],
        time_capsule=item_in.time_capsule.model_dump() if item_in.time_capsule else None,
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get(
    "/{item_id}",
    response_model=VaultItemResponse,
    summary="获取保险库条目详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_vault_item(
    item_id: str, db: AsyncSession = Depends(get_db)
):
    return await get_or_404(db, VaultItem, item_id, "Vault item not found")


@router.patch(
    "/{item_id}",
    response_model=VaultItemResponse,
    summary="更新保险库条目",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_vault_item(
    item_id: str, updates: VaultItemUpdate, db: AsyncSession = Depends(get_db)
):
    item = await get_or_404(db, VaultItem, item_id, "Vault item not found")
    apply_updates(item, updates)
    item.updated_at = utc_now()
    await db.commit()
    await db.refresh(item)
    return item


@router.delete(
    "/{item_id}",
    response_model=None,
    status_code=204,
    summary="删除保险库条目",
    responses=_DELETE_RESPONSES,
)
async def delete_vault_item(
    item_id: str, db: AsyncSession = Depends(get_db)
) -> None:
    item = await get_or_404(db, VaultItem, item_id, "Vault item not found")
    await db.delete(item)
    await db.commit()
    return None
