"""任务模板 API"""
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
from app.schemas.template import TemplateCreate, TemplateResponse, TemplateUpdate
from app.utils.crud import apply_updates, generate_id, get_or_404
from app.utils.json_utils import json_dump, utc_now

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get(
    "/",
    response_model=list[TemplateResponse],
    summary="获取模板列表",
    responses=_COMMON_RESPONSES,
)
async def list_templates(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Template).order_by(Template.created_at.desc())
    )
    return result.scalars().all()


@router.post(
    "/",
    response_model=TemplateResponse,
    status_code=201,
    summary="创建模板",
    responses=_COMMON_RESPONSES,
)
async def create_template(
    template_in: TemplateCreate, db: AsyncSession = Depends(get_db)
):
    now = utc_now()
    template = Template(
        id=template_in.id or generate_id("template"),
        **template_in.model_dump(exclude={
            "id", "created_at", "updated_at", "task_defaults", "variables",
            "usage_count", "last_used_at",
        }),
        task_defaults=json_dump(template_in.task_defaults, "{}"),
        variables=json_dump(template_in.variables),
        created_at=now,
        updated_at=now,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.get(
    "/{template_id}",
    response_model=TemplateResponse,
    summary="获取模板详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_template(
    template_id: str, db: AsyncSession = Depends(get_db)
):
    return await get_or_404(db, Template, template_id, "Template not found")


@router.patch(
    "/{template_id}",
    response_model=TemplateResponse,
    summary="更新模板",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_template(
    template_id: str, updates: TemplateUpdate, db: AsyncSession = Depends(get_db)
):
    template = await get_or_404(db, Template, template_id, "Template not found")
    json_fields = {
        "task_defaults": json_dump,
        "variables": json_dump,
    }
    apply_updates(template, updates, json_fields=json_fields)
    template.updated_at = utc_now()
    await db.commit()
    await db.refresh(template)
    return template


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
