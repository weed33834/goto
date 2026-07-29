"""任务、项目、分类、标签 API"""
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Integer, func, select, update
from sqlalchemy.engine import CursorResult
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
from app.models.task import Category, Project, Tag, Task
from app.schemas.task import (
    CategoryCreate, CategoryResponse, CategoryUpdate,
    ProjectCreate, ProjectResponse, ProjectUpdate,
    TagCreate, TagResponse, TagUpdate,
    TaskCreate, TaskResponse, TaskUpdate,
)
from app.utils.crud import apply_updates, generate_id, get_or_404
from app.utils.json_utils import json_dump, json_load, utc_now
from app.utils.logger import logger

router = APIRouter(prefix="/tasks", tags=["tasks"])


# ——— helper: tag usage_count maintenance ———


async def _recompute_tag_usage_counts(db: AsyncSession) -> None:
    """根据当前未删除未归档任务重新计算所有 Tag 的 usage_count。

    tag 在 Task 中以 JSON 文本数组存储,无法直接 JOIN,因此采用
    "扫一遍 active tasks → Python 端聚合 → 批量 UPDATE tags"。
    """
    result = await db.execute(
        select(Task.tags).where(
            Task.is_deleted.is_(False), Task.is_archived.is_(False)
        )
    )
    counter: dict[str, int] = {}
    for (tags_json,) in result.all():
        for name in json_load(tags_json):
            if isinstance(name, str) and name:
                counter[name] = counter.get(name, 0) + 1

    all_tags = await db.execute(select(Tag))
    for tag in all_tags.scalars():
        new_count = counter.get(tag.name, 0)
        if tag.usage_count != new_count:
            tag.usage_count = new_count


# ——— Tasks ———


@router.get(
    "/",
    response_model=list[TaskResponse],
    summary="获取任务列表",
    responses=_COMMON_RESPONSES,
)
async def list_tasks(
    include_deleted: bool = Query(False),
    include_archived: bool = Query(False),
    completed: bool | None = Query(None, description="按完成状态过滤"),
    status: str | None = Query(None, description="按状态过滤"),
    priority: str | None = Query(None, description="按优先级过滤"),
    category_id: str | None = Query(None, description="按分类 ID 过滤"),
    project_id: str | None = Query(None, description="按项目 ID 过滤"),
    sort_by: str | None = Query(
        None,
        description="排序字段: created_at / updated_at / due_date / priority / title / order",
    ),
    sort_order: str = Query("desc", description="排序方向: asc / desc"),
    db: AsyncSession = Depends(get_db),
):
    """获取任务列表，支持按状态/优先级/分类/项目/完成态过滤与排序。"""
    stmt = select(Task)
    if not include_deleted:
        stmt = stmt.where(Task.is_deleted.is_(False))
    if not include_archived:
        stmt = stmt.where(Task.is_archived.is_(False))
    if completed is not None:
        stmt = stmt.where(Task.completed.is_(completed))
    if status is not None:
        stmt = stmt.where(Task.status == status)
    if priority is not None:
        stmt = stmt.where(Task.priority == priority)
    if category_id is not None:
        stmt = stmt.where(Task.category_id == category_id)
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)

    sort_columns: dict[str, Any] = {
        "created_at": Task.created_at,
        "updated_at": Task.updated_at,
        "due_date": Task.due_date,
        "priority": Task.priority,
        "title": Task.title,
        "order": Task.order,
    }
    if sort_by and sort_by in sort_columns:
        col = sort_columns[sort_by]
        stmt = stmt.order_by(col.asc() if sort_order == "asc" else col.desc())
    else:
        stmt = stmt.order_by(Task.order, Task.created_at.desc())

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/",
    response_model=TaskResponse,
    status_code=201,
    summary="创建任务",
    responses=_COMMON_RESPONSES,
)
async def create_task(
    task_in: TaskCreate, db: AsyncSession = Depends(get_db)
):
    """创建任务"""
    now = utc_now()
    task = Task(
        id=task_in.id or generate_id("task"),
        title=task_in.title,
        description=task_in.description,
        content=task_in.content,
        due_date=task_in.due_date,
        due_time=task_in.due_time,
        start_date=task_in.start_date,
        start_time=task_in.start_time,
        end_date=task_in.end_date,
        reminder_date=task_in.reminder_date,
        energy_level=task_in.energy_level,
        context=task_in.context,
        recurrence=json_dump(task_in.recurrence),
        device_version=json_dump(task_in.device_version or {}),
        location=json_dump(task_in.location),
        priority=task_in.priority,
        status=task_in.status,
        progress=task_in.progress,
        category_id=task_in.category_id,
        project_id=task_in.project_id,
        completed=task_in.completed,
        completed_at=task_in.completed_at,
        estimated_time=task_in.estimated_time,
        actual_time=task_in.actual_time,
        is_recurring=task_in.is_recurring,
        parent_task_id=task_in.parent_task_id,
        is_starred=task_in.is_starred,
        is_hidden=task_in.is_hidden,
        is_archived=task_in.is_archived,
        is_deleted=task_in.is_deleted,
        deleted_at=task_in.deleted_at,
        assignee_id=task_in.assignee_id,
        created_by=task_in.created_by,
        order=task_in.order,
        version=task_in.version,
        tags=json_dump(task_in.tags),
        subtasks=json_dump([s.model_dump() for s in task_in.subtasks]),
        attachments=json_dump(task_in.attachments),
        comments=json_dump(task_in.comments),
        links=json_dump(task_in.links),
        custom_fields=json_dump(task_in.custom_fields),
        dependencies=json_dump(task_in.dependencies),
        blocked_by=json_dump(task_in.blocked_by),
        notes=json_dump(task_in.notes),
        checklist=json_dump([c.model_dump() for c in task_in.checklist]),
        created_at=now,
        updated_at=now,
    )

    _provided = task_in.model_dump(exclude_unset=True)
    _new_status = _provided.get("status")
    if _new_status == "completed":
        if "completed" not in _provided:
            task.completed = True
        if "completed_at" not in _provided:
            task.completed_at = now
    elif _new_status is not None and _new_status != "completed":
        if "completed" not in _provided:
            task.completed = False
        if "completed_at" not in _provided:
            task.completed_at = None

    db.add(task)
    await db.commit()
    await db.refresh(task)
    await _recompute_tag_usage_counts(db)
    await db.commit()
    logger.info(f"Task created: {task.id}")
    return task


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="获取任务详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    return await get_or_404(db, Task, task_id, "Task not found")


@router.patch(
    "/{task_id}",
    response_model=TaskResponse,
    summary="更新任务",
    responses={**_NOT_FOUND_RESPONSES, 409: {"description": "版本冲突（乐观锁）"}},
)
async def update_task(
    task_id: str, updates: TaskUpdate, db: AsyncSession = Depends(get_db)
):
    """更新任务。乐观锁采用单条原子 UPDATE 避免 TOCTOU 竞态(H-2)。"""
    data = updates.model_dump(exclude_unset=True)
    now = utc_now()

    json_fields = {
        "tags", "subtasks", "attachments", "comments", "links",
        "custom_fields", "dependencies", "blocked_by", "notes", "checklist",
        "recurrence", "device_version", "location",
    }

    values: dict[str, Any] = {
        "updated_at": now,
        "version": Task.version + 1,
    }
    for key, value in data.items():
        if key in ("id", "expected_version"):
            continue
        if key in json_fields:
            if (
                isinstance(value, list)
                and value
                and all(hasattr(v, "model_dump") for v in value)
            ):
                value = [v.model_dump() for v in value]
            values[key] = json_dump(value)
        elif hasattr(Task, key):
            values[key] = value

    new_status = data.get("status")
    if new_status == "completed":
        if "completed" not in data:
            values["completed"] = True
        if "completed_at" not in data:
            values["completed_at"] = now
    elif new_status is not None and new_status != "completed":
        if "completed" not in data:
            values["completed"] = False
        if "completed_at" not in data:
            values["completed_at"] = None

    where_conditions = [Task.id == task_id]
    if updates.expected_version is not None:
        where_conditions.append(Task.version == updates.expected_version)

    stmt = (
        update(Task)
        .where(*where_conditions)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    result = await db.execute(stmt)

    if cast(CursorResult[Any], result).rowcount == 0:
        task = await get_or_404(db, Task, task_id, "Task not found")
        raise HTTPException(
            status_code=409,
            detail=(
                f"版本冲突：期望 version={updates.expected_version}，"
                f"实际 version={task.version}"
            ),
        )

    refresh_result = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .execution_options(populate_existing=True)
    )
    task = refresh_result.scalar_one()
    await db.commit()
    if "tags" in data or "is_deleted" in data or "is_archived" in data:
        await _recompute_tag_usage_counts(db)
        await db.commit()
    logger.info(f"Task updated: {task.id}")
    return task


@router.delete(
    "/{task_id}",
    response_model=None,
    status_code=204,
    summary="删除任务",
    responses=_DELETE_RESPONSES,
)
async def delete_task(
    task_id: str, hard: bool = Query(False), db: AsyncSession = Depends(get_db)
) -> None:
    """删除任务（默认软删除）"""
    task = await get_or_404(db, Task, task_id, "Task not found")
    need_recount = bool(task.tags and json_load(task.tags))

    if hard:
        await db.delete(task)
    else:
        task.is_deleted = True
        task.deleted_at = utc_now()
        task.updated_at = utc_now()

    await db.commit()
    if need_recount:
        await _recompute_tag_usage_counts(db)
        await db.commit()
    logger.info(f"Task deleted: {task_id}")
    return None


# ——— Projects ———


async def _compute_project_stats(db: AsyncSession) -> dict[str, tuple[int, int]]:
    """聚合查询每个项目的 (total, completed) 任务数。"""
    stmt = (
        select(
            Task.project_id,
            func.count(Task.id),
            func.coalesce(func.sum(Task.completed.cast(Integer)), 0),
        )
        .where(Task.is_deleted.is_(False), Task.is_archived.is_(False))
        .where(Task.project_id.is_not(None))
        .group_by(Task.project_id)
    )
    result = await db.execute(stmt)
    return {
        pid: (int(total), int(completed or 0))
        for pid, total, completed in result.all()
    }


@router.get(
    "/projects/",
    response_model=list[ProjectResponse],
    summary="获取项目列表",
    responses=_COMMON_RESPONSES,
)
async def list_projects(db: AsyncSession = Depends(get_db)):
    """获取项目列表，附带任务统计 (task_count/ completed_task_count/ progress)。"""
    result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    projects = result.scalars().all()
    stats = await _compute_project_stats(db)
    return [_enrich_project(p, stats.get(p.id)) for p in projects]


def _enrich_project(project: Project, stats: tuple[int, int] | None = None) -> dict[str, Any]:
    """构造带统计字段的 Project dict,供 model_validate 使用。"""
    total, completed = stats if stats else (0, 0)
    progress = int(completed * 100 / total) if total > 0 else 0
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "color": project.color,
        "icon": project.icon,
        "status": project.status,
        "is_default": project.is_default,
        "is_favorite": project.is_favorite,
        "is_archived": project.is_archived,
        "parent_project_id": project.parent_project_id,
        "owner_id": project.owner_id,
        "task_count": total,
        "completed_task_count": completed,
        "progress": progress,
        "start_date": project.start_date,
        "due_date": project.due_date,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "tags": project.tags,  # str → model_validator 会解析
    }


@router.post(
    "/projects/",
    response_model=ProjectResponse,
    status_code=201,
    summary="创建项目",
    responses=_COMMON_RESPONSES,
)
async def create_project(
    project_in: ProjectCreate, db: AsyncSession = Depends(get_db)
):
    now = utc_now()
    project = Project(
        id=project_in.id or generate_id("project"),
        **project_in.model_dump(exclude={
            "id", "created_at", "updated_at", "tags",
            "task_count", "completed_task_count", "progress",
        }),
        tags=json_dump(project_in.tags),
        created_at=now,
        updated_at=now,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return _enrich_project(project)


@router.get(
    "/projects/{project_id}",
    response_model=ProjectResponse,
    summary="获取项目详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await get_or_404(db, Project, project_id, "Project not found")
    stats = await _compute_project_stats(db)
    return _enrich_project(project, stats.get(project_id))


@router.patch(
    "/projects/{project_id}",
    response_model=ProjectResponse,
    summary="更新项目",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_project(
    project_id: str, updates: ProjectUpdate, db: AsyncSession = Depends(get_db)
):
    project = await get_or_404(db, Project, project_id, "Project not found")
    apply_updates(project, updates, json_fields={"tags": json_dump})
    project.updated_at = utc_now()
    await db.commit()
    await db.refresh(project)
    return _enrich_project(project)


@router.delete(
    "/projects/{project_id}",
    response_model=None,
    status_code=204,
    summary="删除项目",
    responses=_DELETE_RESPONSES,
)
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)) -> None:
    project = await get_or_404(db, Project, project_id, "Project not found")
    await db.delete(project)
    await db.commit()
    return None


# ——— Categories ———


async def _compute_category_stats(db: AsyncSession) -> dict[str, int]:
    """聚合查询每个分类的任务数(未删除未归档)。"""
    stmt = (
        select(Task.category_id, func.count(Task.id))
        .where(Task.is_deleted.is_(False), Task.is_archived.is_(False))
        .where(Task.category_id.is_not(None))
        .group_by(Task.category_id)
    )
    result = await db.execute(stmt)
    return {cid: int(cnt) for cid, cnt in result.all()}


def _enrich_category(category: Category, task_count: int = 0) -> dict[str, Any]:
    return {
        "id": category.id,
        "name": category.name,
        "description": category.description,
        "color": category.color,
        "icon": category.icon,
        "is_system": category.is_system,
        "is_archived": category.is_archived,
        "parent_category_id": category.parent_category_id,
        "project_id": category.project_id,
        "order": category.order,
        "task_count": task_count,
        "created_at": category.created_at,
        "updated_at": category.updated_at,
    }


@router.get(
    "/categories/",
    response_model=list[CategoryResponse],
    summary="获取分类列表",
    responses=_COMMON_RESPONSES,
)
async def list_categories(db: AsyncSession = Depends(get_db)):
    """获取分类列表，附带任务数 (task_count)。"""
    result = await db.execute(
        select(Category).order_by(Category.order, Category.created_at.desc())
    )
    categories = result.scalars().all()
    stats = await _compute_category_stats(db)
    return [_enrich_category(c, stats.get(c.id, 0)) for c in categories]


@router.post(
    "/categories/",
    response_model=CategoryResponse,
    status_code=201,
    summary="创建分类",
    responses=_COMMON_RESPONSES,
)
async def create_category(
    category_in: CategoryCreate, db: AsyncSession = Depends(get_db)
):
    now = utc_now()
    category = Category(
        id=category_in.id or generate_id("category"),
        **category_in.model_dump(exclude={"id", "created_at", "updated_at"}),
        created_at=now,
        updated_at=now,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return _enrich_category(category)


@router.get(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    summary="获取分类详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_category(category_id: str, db: AsyncSession = Depends(get_db)):
    category = await get_or_404(db, Category, category_id, "Category not found")
    stats = await _compute_category_stats(db)
    return _enrich_category(category, stats.get(category_id, 0))


@router.patch(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    summary="更新分类",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_category(
    category_id: str, updates: CategoryUpdate, db: AsyncSession = Depends(get_db)
):
    category = await get_or_404(db, Category, category_id, "Category not found")
    apply_updates(category, updates)
    category.updated_at = utc_now()
    await db.commit()
    await db.refresh(category)
    stats = await _compute_category_stats(db)
    return _enrich_category(category, stats.get(category_id, 0))


@router.delete(
    "/categories/{category_id}",
    response_model=None,
    status_code=204,
    summary="删除分类",
    responses=_DELETE_RESPONSES,
)
async def delete_category(category_id: str, db: AsyncSession = Depends(get_db)) -> None:
    category = await get_or_404(db, Category, category_id, "Category not found")
    await db.delete(category)
    await db.commit()
    return None


# ——— Tags ———


@router.get(
    "/tags/",
    response_model=list[TagResponse],
    summary="获取标签列表",
    responses=_COMMON_RESPONSES,
)
async def list_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).order_by(Tag.created_at.desc()))
    return result.scalars().all()


@router.post(
    "/tags/",
    response_model=TagResponse,
    status_code=201,
    summary="创建标签",
    responses=_COMMON_RESPONSES,
)
async def create_tag(tag_in: TagCreate, db: AsyncSession = Depends(get_db)):
    now = utc_now()
    tag = Tag(
        id=tag_in.id or generate_id("tag"),
        **tag_in.model_dump(exclude={"id", "created_at", "updated_at", "usage_count"}),
        created_at=now,
        updated_at=now,
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.get(
    "/tags/{tag_id}",
    response_model=TagResponse,
    summary="获取标签详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_tag(tag_id: str, db: AsyncSession = Depends(get_db)):
    return await get_or_404(db, Tag, tag_id, "Tag not found")


@router.patch(
    "/tags/{tag_id}",
    response_model=TagResponse,
    summary="更新标签",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_tag(
    tag_id: str, updates: TagUpdate, db: AsyncSession = Depends(get_db)
):
    tag = await get_or_404(db, Tag, tag_id, "Tag not found")
    apply_updates(tag, updates)
    tag.updated_at = utc_now()
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete(
    "/tags/{tag_id}",
    response_model=None,
    status_code=204,
    summary="删除标签",
    responses=_DELETE_RESPONSES,
)
async def delete_tag(tag_id: str, db: AsyncSession = Depends(get_db)) -> None:
    tag = await get_or_404(db, Tag, tag_id, "Tag not found")
    await db.delete(tag)
    await db.commit()
    return None
