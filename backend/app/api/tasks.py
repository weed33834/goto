"""任务、项目、分类、标签 API"""
import json
from datetime import datetime, timezone
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
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
    CategoryCreate,
    CategoryResponse,
    CategoryUpdate,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    TagCreate,
    TagResponse,
    TagUpdate,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
)
from app.utils.crud import apply_updates, generate_id, get_or_404
from app.utils.logger import logger

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dump(value: Any) -> str:
    if value is None:
        return "[]"
    return json.dumps(value, ensure_ascii=False, default=str)


def _load(value: str | None, default: Any = None) -> Any:
    if value is None:
        return default if default is not None else []
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default if default is not None else []


# Task 中以 JSON 文本存储的字段，响应时需 _load 反序列化
_TASK_JSON_FIELDS = (
    "tags", "subtasks", "attachments", "comments", "links",
    "custom_fields", "dependencies", "blocked_by", "notes", "checklist",
)


def _task_to_response(task: Task) -> dict[str, Any]:
    data = {
        "id": task.id, "title": task.title, "description": task.description,
        "content": task.content, "due_date": task.due_date,
        "start_date": task.start_date, "reminder_date": task.reminder_date,
        "priority": task.priority, "status": task.status, "progress": task.progress,
        "category_id": task.category_id, "project_id": task.project_id,
        "completed": task.completed, "completed_at": task.completed_at,
        "estimated_time": task.estimated_time, "actual_time": task.actual_time,
        "is_recurring": task.is_recurring, "parent_task_id": task.parent_task_id,
        "is_starred": task.is_starred, "is_hidden": task.is_hidden,
        "is_archived": task.is_archived, "is_deleted": task.is_deleted,
        "deleted_at": task.deleted_at, "assignee_id": task.assignee_id,
        "created_by": task.created_by, "order": task.order, "version": task.version,
        "created_at": task.created_at, "updated_at": task.updated_at,
    }
    for f in _TASK_JSON_FIELDS:
        data[f] = _load(getattr(task, f))
    return data


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
        description=(
            "排序字段: created_at / updated_at / due_date / priority / title / order"
        ),
    ),
    sort_order: str = Query("desc", description="排序方向: asc / desc"),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """获取任务列表，支持按状态/优先级/分类/项目/完成态过滤与排序。

    不传 sort_by 时按默认顺序 (order, created_at desc) 排序。
    """
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
    return [_task_to_response(t) for t in result.scalars().all()]


@router.post(
    "/",
    response_model=TaskResponse,
    status_code=201,
    summary="创建任务",
    responses=_COMMON_RESPONSES,
)
async def create_task(
    task_in: TaskCreate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """创建任务"""
    now = _now()
    task = Task(
        id=task_in.id or generate_id("task"),
        title=task_in.title,
        description=task_in.description,
        content=task_in.content,
        due_date=task_in.due_date,
        start_date=task_in.start_date,
        reminder_date=task_in.reminder_date,
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
        tags=_dump(task_in.tags),
        subtasks=_dump([s.model_dump() for s in task_in.subtasks]),
        attachments=_dump(task_in.attachments),
        comments=_dump(task_in.comments),
        links=_dump(task_in.links),
        custom_fields=_dump(task_in.custom_fields),
        dependencies=_dump(task_in.dependencies),
        blocked_by=_dump(task_in.blocked_by),
        notes=_dump(task_in.notes),
        checklist=_dump([c.model_dump() for c in task_in.checklist]),
        created_at=now,
        updated_at=now,
    )

    # 业务规则联动：与 update_task 保持一致，确保新建任务的
    # status / completed / completed_at 三字段一致，避免第三方客户端
    # 只传 status 时出现 completed 与 status 不一致。
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
    logger.info(f"Task created: {task.id}")
    return _task_to_response(task)


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="获取任务详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_task(
    task_id: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """获取单个任务"""
    task = await get_or_404(db, Task, task_id, "Task not found")
    return _task_to_response(task)


@router.patch(
    "/{task_id}",
    response_model=TaskResponse,
    summary="更新任务",
    responses={**_NOT_FOUND_RESPONSES, 409: {"description": "版本冲突（乐观锁）"}},
)
async def update_task(
    task_id: str, updates: TaskUpdate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """更新任务

    乐观锁采用单条原子 UPDATE 实现，避免 TOCTOU 竞态（H-2）：
    UPDATE tasks SET ..., version = version + 1, updated_at = :now
    WHERE id = :task_id AND version = :expected_version
    通过 result.rowcount 判断是否命中：
    - rowcount == 1：更新成功
    - rowcount == 0：任务不存在或 version 不匹配，二次 SELECT 区分 404 / 409
    不传 expected_version 时 WHERE 仅含 id 条件，保持向后兼容。
    """
    data = updates.model_dump(exclude_unset=True)
    now = _now()

    json_fields = {
        "tags": "tags",
        "subtasks": "subtasks",
        "attachments": "attachments",
        "comments": "comments",
        "links": "links",
        "custom_fields": "custom_fields",
        "dependencies": "dependencies",
        "blocked_by": "blocked_by",
        "notes": "notes",
        "checklist": "checklist",
    }

    # 构造原子 UPDATE 的 SET 子句：version 自增、updated_at 刷新，
    # 再叠加客户端传入的字段（JSON 字段序列化为文本，普通字段直接赋值）。
    values: dict[str, Any] = {
        "updated_at": now,
        "version": Task.version + 1,
    }
    for key, value in data.items():
        # id 与 expected_version 不是任务字段，跳过
        # （expected_version 仅用于乐观锁 WHERE 条件）
        if key in ("id", "expected_version"):
            continue
        if key in json_fields:
            if (
                isinstance(value, list)
                and value
                and all(hasattr(v, "model_dump") for v in value)
            ):
                value = [v.model_dump() for v in value]
            values[json_fields[key]] = _dump(value)
        elif hasattr(Task, key):
            values[key] = value

    # 业务规则联动：当 status 变为 completed 时，自动设置 completed=True
    # 和 completed_at=now（若客户端未显式提供这两个字段）；
    # 当 status 从 completed 改为其他值时，清除 completed 和 completed_at。
    # 这保证 backend 数据一致性，与前端 tasksSlice 的联动逻辑对齐，
    # 避免第三方客户端只传 status 时出现 completed/completed_at 与 status 不一致。
    new_status = data.get("status")
    if new_status == "completed":
        if "completed" not in data:
            values["completed"] = True
        if "completed_at" not in data:
            values["completed_at"] = now
    elif new_status is not None and new_status != "completed":
        # 离开 completed 状态时清除完成标记（除非客户端显式提供）
        if "completed" not in data:
            values["completed"] = False
        if "completed_at" not in data:
            values["completed_at"] = None

    # 构造原子 UPDATE 的 WHERE 子句：始终含 id，传入 expected_version 时追加 version
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
        # 更新命中 0 行：任务不存在或 version 不匹配，二次 SELECT 区分 404 / 409
        task = await get_or_404(db, Task, task_id, "Task not found")
        raise HTTPException(
            status_code=409,
            detail=(
                f"版本冲突：期望 version={updates.expected_version}，"
                f"实际 version={task.version}"
            ),
        )

    # 更新成功，重新加载任务对象以获取最新 version（populate_existing 避免返回
    # identity map 中的过期对象，因 synchronize_session=False 不会自动同步）
    refresh_result = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .execution_options(populate_existing=True)
    )
    task = refresh_result.scalar_one()
    await db.commit()
    logger.info(f"Task updated: {task.id}")
    return _task_to_response(task)


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

    if hard:
        await db.delete(task)
    else:
        task.is_deleted = True
        task.deleted_at = _now()
        task.updated_at = _now()

    await db.commit()
    logger.info(f"Task deleted: {task_id}")
    return None


def _project_to_response(project: Project) -> dict[str, Any]:
    # from_attributes=True 会读取 project.tags（字符串 '[]'）并尝试校验为 list[str]，
    # 直接 model_validate 会失败。同时 ORM 没有 task_count/completed_task_count/progress
    # 这类计算字段（Schema 默认 0），也不能用 getattr 直接取。改为手动构造 dict，
    # 只取 ORM 实际存在的列，其余字段由 Schema 默认值填充。
    data = ProjectResponse.model_validate(
        {
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
            "start_date": project.start_date,
            "due_date": project.due_date,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
        }
    ).model_dump()
    data["tags"] = _load(project.tags)
    return data


# Projects


@router.get(
    "/projects/",
    response_model=list[ProjectResponse],
    summary="获取项目列表",
    responses=_COMMON_RESPONSES,
)
async def list_projects(db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    """获取项目列表"""
    result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    return [_project_to_response(p) for p in result.scalars().all()]


@router.post(
    "/projects/",
    response_model=ProjectResponse,
    status_code=201,
    summary="创建项目",
    responses=_COMMON_RESPONSES,
)
async def create_project(
    project_in: ProjectCreate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """创建项目"""
    now = _now()
    project = Project(
        id=project_in.id or generate_id("project"),
        **project_in.model_dump(exclude={
            "id", "created_at", "updated_at", "tags",
            "task_count", "completed_task_count", "progress",
        }),
        tags=_dump(project_in.tags),
        created_at=now,
        updated_at=now,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return _project_to_response(project)


@router.get(
    "/projects/{project_id}",
    response_model=ProjectResponse,
    summary="获取项目详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_project(
    project_id: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    project = await get_or_404(db, Project, project_id, "Project not found")
    return _project_to_response(project)


@router.patch(
    "/projects/{project_id}",
    response_model=ProjectResponse,
    summary="更新项目",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_project(
    project_id: str, updates: ProjectUpdate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    project = await get_or_404(db, Project, project_id, "Project not found")

    apply_updates(project, updates, json_fields={"tags": _dump})

    project.updated_at = _now()
    await db.commit()
    await db.refresh(project)
    return _project_to_response(project)


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


# Categories


@router.get(
    "/categories/",
    response_model=list[CategoryResponse],
    summary="获取分类列表",
    responses=_COMMON_RESPONSES,
)
async def list_categories(db: AsyncSession = Depends(get_db)) -> list[Category]:
    result = await db.execute(
        select(Category).order_by(Category.order, Category.created_at.desc())
    )
    return list(result.scalars().all())


@router.post(
    "/categories/",
    response_model=CategoryResponse,
    status_code=201,
    summary="创建分类",
    responses=_COMMON_RESPONSES,
)
async def create_category(
    category_in: CategoryCreate, db: AsyncSession = Depends(get_db)
) -> Category:
    now = _now()
    category = Category(
        id=category_in.id or generate_id("category"),
        **category_in.model_dump(exclude={"id", "created_at", "updated_at"}),
        created_at=now,
        updated_at=now,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@router.get(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    summary="获取分类详情",
    responses=_NOT_FOUND_RESPONSES,
)
async def get_category(
    category_id: str, db: AsyncSession = Depends(get_db)
) -> Category:
    category = await get_or_404(db, Category, category_id, "Category not found")
    return category


@router.patch(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    summary="更新分类",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_category(
    category_id: str, updates: CategoryUpdate, db: AsyncSession = Depends(get_db)
) -> Category:
    category = await get_or_404(db, Category, category_id, "Category not found")

    apply_updates(category, updates)

    category.updated_at = _now()
    await db.commit()
    await db.refresh(category)
    return category


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


# Tags


@router.get(
    "/tags/",
    response_model=list[TagResponse],
    summary="获取标签列表",
    responses=_COMMON_RESPONSES,
)
async def list_tags(db: AsyncSession = Depends(get_db)) -> list[Tag]:
    result = await db.execute(select(Tag).order_by(Tag.created_at.desc()))
    return list(result.scalars().all())


@router.post(
    "/tags/",
    response_model=TagResponse,
    status_code=201,
    summary="创建标签",
    responses=_COMMON_RESPONSES,
)
async def create_tag(tag_in: TagCreate, db: AsyncSession = Depends(get_db)) -> Tag:
    now = _now()
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
async def get_tag(tag_id: str, db: AsyncSession = Depends(get_db)) -> Tag:
    tag = await get_or_404(db, Tag, tag_id, "Tag not found")
    return tag


@router.patch(
    "/tags/{tag_id}",
    response_model=TagResponse,
    summary="更新标签",
    responses=_NOT_FOUND_RESPONSES,
)
async def update_tag(
    tag_id: str, updates: TagUpdate, db: AsyncSession = Depends(get_db)
) -> Tag:
    tag = await get_or_404(db, Tag, tag_id, "Tag not found")

    apply_updates(tag, updates)

    tag.updated_at = _now()
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
