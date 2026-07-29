"""保险库 API"""
import json
from datetime import datetime, timezone
from typing import Any

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
from app.schemas.vault import (
    VaultItemCreate,
    VaultItemResponse,
    VaultItemUpdate,
)
from app.utils.crud import apply_updates, generate_id, get_or_404

router = APIRouter(prefix="/vault", tags=["vault"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dump(value: Any) -> str:
    if value is None:
        return "[]"
    return json.dumps(value, ensure_ascii=False, default=str)


def _dump_nullable(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)


def _load(value: str | None) -> list[dict[str, Any]]:
    if value is None:
        return []
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return []


def _load_nullable(value: str | None) -> Any:
    if value is None:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def _vault_to_response(item: VaultItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "type": item.type,
        "title": item.title,
        "is_hidden": item.is_hidden,
        "created_by": item.created_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "fields": _load(item.fields),
        "time_capsule": _load_nullable(item.time_capsule),
    }


@router.get(
    "/",
    response_model=list[VaultItemResponse],
    summary="获取保险库条目列表",
    responses=_COMMON_RESPONSES,
)
async def list_vault_items(
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(VaultItem).order_by(VaultItem.created_at.desc())
    )
    return [_vault_to_response(v) for v in result.scalars().all()]


@router.post(
    "/",
    response_model=VaultItemResponse,
    status_code=201,
    summary="创建保险库条目",
    responses=_COMMON_RESPONSES,
)
async def create_vault_item(
    item_in: VaultItemCreate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    now = _now()
    item = VaultItem(
        id=item_in.id or generate_id("vault"),
        **item_in.model_dump(exclude={
            "id", "created_at", "updated_at", "fields", "time_capsule",
        }),
        fields=_dump(
            [f.model_dump() for f in item_in.fields]
        ),
        time_capsule=_dump_nullable(
            item_in.time_capsule.model_dump() if item_in.time_capsule else None
        ),
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _vault_to_response(item)


@router.get(
    "/{item_id}",
    response_model=VaultItemResponse,
    summary="获取保险库条目详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_vault_item(
    item_id: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    item = await get_or_404(db, VaultItem, item_id, "Vault item not found")
    return _vault_to_response(item)


@router.patch(
    "/{item_id}",
    response_model=VaultItemResponse,
    summary="更新保险库条目",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_vault_item(
    item_id: str, updates: VaultItemUpdate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    item = await get_or_404(db, VaultItem, item_id, "Vault item not found")
    json_fields = {
        "fields": lambda v: _dump(
            [f.model_dump() for f in v] if v and hasattr(v[0], "model_dump") else v
        ),
        "time_capsule": lambda v: _dump_nullable(
            v.model_dump() if v and hasattr(v, "model_dump") else v
        ),
    }
    apply_updates(item, updates, json_fields=json_fields)
    item.updated_at = _now()
    await db.commit()
    await db.refresh(item)
    return _vault_to_response(item)


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
