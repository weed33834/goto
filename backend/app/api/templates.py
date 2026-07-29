"""任务模板 API"""
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
from app.models.template import Template
from app.schemas.template import (
    TemplateCreate,
    TemplateResponse,
    TemplateUpdate,
)
from app.utils.crud import apply_updates, generate_id, get_or_404

router = APIRouter(prefix="/templates", tags=["templates"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dump(value: Any) -> str:
    if value is None:
        return "{}"
    return json.dumps(value, ensure_ascii=False, default=str)


def _load(value: str | None) -> Any:
    if value is None:
        return {}
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return {}


def _load_array(value: str | None) -> list[str]:
    if value is None:
        return []
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return []


def _template_to_response(template: Template) -> dict[str, Any]:
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "is_built_in": template.is_built_in,
        "usage_count": template.usage_count,
        "last_used_at": template.last_used_at,
        "created_by": template.created_by,
        "created_at": template.created_at,
        "updated_at": template.updated_at,
        "task_defaults": _load(template.task_defaults),
        "variables": _load_array(template.variables),
    }


@router.get(
    "/",
    response_model=list[TemplateResponse],
    summary="获取模板列表",
    responses=_COMMON_RESPONSES,
)
async def list_templates(
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(Template).order_by(Template.created_at.desc())
    )
    return [_template_to_response(t) for t in result.scalars().all()]


@router.post(
    "/",
    response_model=TemplateResponse,
    status_code=201,
    summary="创建模板",
    responses=_COMMON_RESPONSES,
)
async def create_template(
    template_in: TemplateCreate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    now = _now()
    template = Template(
        id=template_in.id or generate_id("template"),
        **template_in.model_dump(exclude={
            "id", "created_at", "updated_at", "task_defaults", "variables",
            "usage_count", "last_used_at",
        }),
        task_defaults=_dump(template_in.task_defaults),
        variables=_dump(template_in.variables),
        created_at=now,
        updated_at=now,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return _template_to_response(template)


@router.get(
    "/{template_id}",
    response_model=TemplateResponse,
    summary="获取模板详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_template(
    template_id: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    template = await get_or_404(db, Template, template_id, "Template not found")
    return _template_to_response(template)


@router.patch(
    "/{template_id}",
    response_model=TemplateResponse,
    summary="更新模板",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_template(
    template_id: str, updates: TemplateUpdate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    template = await get_or_404(db, Template, template_id, "Template not found")
    json_fields = {
        "task_defaults": _dump,
        "variables": _dump,
    }
    apply_updates(template, updates, json_fields=json_fields)
    template.updated_at = _now()
    await db.commit()
    await db.refresh(template)
    return _template_to_response(template)


@router.delete(
    "/{template_id}",
    response_model=None,
    status_code=204,
    summary="删除模板",
    responses=_DELETE_RESPONSES,
)
async def delete_template(
    template_id: str, db: AsyncSession = Depends(get_db)
) -> None:
    template = await get_or_404(db, Template, template_id, "Template not found")
    await db.delete(template)
    await db.commit()
    return None
