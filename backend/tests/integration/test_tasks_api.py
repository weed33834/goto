"""任务 API 集成测试

重点覆盖 PATCH /api/v1/tasks/{task_id} 的乐观锁行为（H-2 修复）：
- 单条原子 UPDATE WHERE version = :expected_version，避免 TOCTOU 竞态
- expected_version 不匹配返回 409，响应体包含当前 version
- 任务不存在返回 404
- 正常更新成功后 version 自增
- 并发场景下同一 expected_version 只能成功一次
- SQL 层面验证更新走单条原子 UPDATE（而非 SELECT + UPDATE）
"""
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core import security
from app.database import Base, get_db
from app.main import app

# 使用高熵测试 token，与 test_api.py 保持一致
TEST_API_TOKEN = "tF8kQ2mP9vX4nL7bR5wJ3cY6hA1sE0dU4iO2pK5lN8jH3gF7qT9zC6xV2yB5"


@pytest.fixture(autouse=True)
def fixed_api_token(monkeypatch):
    """固定测试用 API token，避免受本地临时文件影响。"""
    monkeypatch.setattr(settings, "api_token", TEST_API_TOKEN)
    monkeypatch.setattr(settings, "api_token_file", None)
    monkeypatch.setattr(security, "_API_TOKEN", None)


@pytest_asyncio.fixture
async def db_session():
    """创建测试数据库会话（内存 SQLite）"""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    """创建测试客户端，所有请求共享同一个会话。"""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    """返回包含认证 token 的请求头"""
    return {"Authorization": f"Bearer {TEST_API_TOKEN}"}


async def _create_task(
    client: AsyncClient, auth_headers: dict[str, str], title: str = "test task"
) -> dict[str, Any]:
    """辅助：创建一个任务并返回响应体。"""
    resp = await client.post(
        "/api/v1/tasks/", json={"title": title}, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_update_task_success_increments_version(client, auth_headers):
    """正常更新：传入正确 expected_version，version 应自增 1。"""
    task = await _create_task(client, auth_headers, "version bump")
    task_id = task["id"]
    original_version = task["version"]

    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "bumped", "expected_version": original_version},
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["title"] == "bumped"
    assert body["version"] == original_version + 1


@pytest.mark.asyncio
async def test_update_task_without_expected_version_succeeds(client, auth_headers):
    """不传 expected_version 时跳过版本校验，更新成功且 version 自增（向后兼容）。"""
    task = await _create_task(client, auth_headers, "no version check")
    task_id = task["id"]
    original_version = task["version"]

    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "updated without version"},
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["title"] == "updated without version"
    assert body["version"] == original_version + 1


@pytest.mark.asyncio
async def test_update_task_version_conflict_returns_409_with_current_version(
    client, auth_headers
):
    """expected_version 不匹配时返回 409，响应体包含当前 version。"""
    task = await _create_task(client, auth_headers, "conflict")
    task_id = task["id"]
    current_version = task["version"]
    wrong_expected = current_version + 100

    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "stale write", "expected_version": wrong_expected},
        headers=auth_headers,
    )

    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    # 响应体必须包含当前 version，供客户端据此重试
    assert f"实际 version={current_version}" in detail
    assert str(wrong_expected) in detail


@pytest.mark.asyncio
async def test_update_task_not_found_returns_404(client, auth_headers):
    """更新不存在的任务返回 404（即使带了 expected_version）。"""
    resp = await client.patch(
        "/api/v1/tasks/nonexistent_task_id",
        json={"title": "ghost", "expected_version": 1},
        headers=auth_headers,
    )

    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"] == "Task not found"


@pytest.mark.asyncio
async def test_update_task_not_found_without_expected_version(client, auth_headers):
    """不传 expected_version 时更新不存在的任务也返回 404。"""
    resp = await client.patch(
        "/api/v1/tasks/nonexistent_task_id",
        json={"title": "ghost"},
        headers=auth_headers,
    )

    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_concurrent_update_same_expected_version_only_first_succeeds(
    client, auth_headers
):
    """模拟并发：两个请求都持有相同 expected_version，仅第一个成功，第二个 409。

    这是 H-2 TOCTOU 修复的核心验证：原子 UPDATE WHERE version=:expected
    保证数据库层面只有一个请求能命中，杜绝“双读 version=5 → 双更新成功”。
    """
    task = await _create_task(client, auth_headers, "race contender")
    task_id = task["id"]
    expected_version = task["version"]

    # 第一个请求：携带 expected_version 更新，应成功
    first = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "first writer wins", "expected_version": expected_version},
        headers=auth_headers,
    )
    assert first.status_code == 200, first.text
    assert first.json()["version"] == expected_version + 1

    # 第二个请求：仍用同一个 expected_version（模拟并发读到旧值），应 409
    second = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "second writer loses", "expected_version": expected_version},
        headers=auth_headers,
    )
    assert second.status_code == 409, second.text
    detail = second.json()["detail"]
    # 响应体含当前 version（已被第一个请求 +1）
    assert f"实际 version={expected_version + 1}" in detail


@pytest.mark.asyncio
async def test_update_task_uses_atomic_update_with_version_in_where(
    client, auth_headers, db_session, monkeypatch
):
    """SQL 层面验证：更新走单条原子 UPDATE，WHERE 子句含 version 条件。

    用 spy 包裹 session.execute 捕获所有语句，断言存在一条 UPDATE 语句
    同时包含 tasks.id 与 tasks.version 的条件——这正是避免 TOCTOU 的关键。
    """
    task = await _create_task(client, auth_headers, "sql spy target")
    task_id = task["id"]

    captured: list[Any] = []
    real_execute = db_session.execute

    async def spy(stmt, *args, **kwargs):
        captured.append(stmt)
        return await real_execute(stmt, *args, **kwargs)

    monkeypatch.setattr(db_session, "execute", spy)

    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "atomic", "expected_version": task["version"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text

    # 编译每条捕获语句为 SQL 字符串（含字面量参数），便于断言
    sql_strings: list[str] = []
    for stmt in captured:
        try:
            compiled = stmt.compile(compile_kwargs={"literal_binds": True})
            sql_strings.append(str(compiled))
        except Exception:
            sql_strings.append(str(stmt))

    # 必须存在一条原子 UPDATE，WHERE 同时含 id 与 version
    atomic_updates = [
        s
        for s in sql_strings
        if s.upper().startswith("UPDATE")
        and "tasks" in s.lower()
        and "version" in s.lower()
        and f"'{task_id}'" in s
    ]
    assert atomic_updates, (
        f"未找到带 version 条件的原子 UPDATE 语句，捕获的 SQL: {sql_strings}"
    )


@pytest.mark.asyncio
async def test_update_task_json_fields_serialized_correctly(client, auth_headers):
    """更新 JSON 字段（tags/subtasks/checklist）时正确序列化为文本存储。"""
    task = await _create_task(client, auth_headers, "json fields")
    task_id = task["id"]

    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={
            "tags": ["urgent", "backend"],
            "checklist": [
                {"id": "c1", "text": "step 1", "completed": False},
            ],
            "expected_version": task["version"],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tags"] == ["urgent", "backend"]
    assert len(body["checklist"]) == 1
    assert body["checklist"][0]["text"] == "step 1"
    assert body["version"] == task["version"] + 1


@pytest.mark.asyncio
async def test_sequential_updates_chain_expected_version(client, auth_headers):
    """连续更新：每次用上一次响应的 version 作为下一次的 expected_version。"""
    task = await _create_task(client, auth_headers, "chain")
    task_id = task["id"]
    current_version = task["version"]

    for i in range(3):
        resp = await client.patch(
            f"/api/v1/tasks/{task_id}",
            json={"title": f"iter {i}", "expected_version": current_version},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        current_version = resp.json()["version"]
        assert current_version == task["version"] + i + 1


# Bug #2 回归测试：PATCH /tasks/{id} status / completed / completed_at 联动
# 客户端只传 status='completed' 时 backend 曾不联动 completed/completed_at，
# 导致 DB 不一致；update_task 现在在未显式提供时按业务规则自动填充。


@pytest.mark.asyncio
async def test_patch_status_completed_auto_sets_completed_and_completed_at(
    client, auth_headers
):
    """status -> completed 时，未显式提供 completed/completed_at 应自动填充。"""
    task = await _create_task(client, auth_headers, "linkage auto set")
    task_id = task["id"]

    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "completed"},
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "completed"
    assert body["completed"] is True
    assert body["completed_at"] is not None
    # completed_at 应为合法 ISO 时间字符串（SQLite 可能不带时区后缀）
    parsed = body["completed_at"]
    assert isinstance(parsed, str) and len(parsed) >= 10
    from datetime import datetime as _dt

    _dt.fromisoformat(parsed.replace("Z", "+00:00"))


@pytest.mark.asyncio
async def test_patch_status_from_completed_to_todo_clears_completed_and_completed_at(
    client, auth_headers
):
    """status 从 completed 改为其他值时，未显式提供 completed/completed_at 自动清除。"""
    task = await _create_task(client, auth_headers, "linkage auto clear")
    task_id = task["id"]

    # 先标完成
    await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "completed"},
        headers=auth_headers,
    )

    # 再改回 todo
    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "todo"},
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "todo"
    assert body["completed"] is False
    assert body["completed_at"] is None


@pytest.mark.asyncio
async def test_patch_status_completed_respects_explicit_completed_false(
    client, auth_headers
):
    """客户端显式传 completed=false 时，即使 status=completed 也尊重客户端值。

    防止 backend 联动逻辑覆盖客户端的显式意图（如调试/特殊业务场景）。
    """
    task = await _create_task(client, auth_headers, "explicit override")
    task_id = task["id"]

    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "completed", "completed": False},
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "completed"
    # 客户端显式传了 completed=false，backend 不应覆盖
    assert body["completed"] is False


@pytest.mark.asyncio
async def test_patch_status_completed_respects_explicit_completed_at(
    client, auth_headers
):
    """客户端显式传 completed_at 时，backend 不应覆盖。"""
    task = await _create_task(client, auth_headers, "explicit completedAt")
    task_id = task["id"]
    custom_ts = "2026-01-15T10:30:00Z"

    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "completed", "completed_at": custom_ts},
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "completed"
    assert body["completed"] is True
    # 客户端显式传的 completed_at 应被保留（SQLite 存储可能丢时区后缀，
    # 用 fromisoformat 解析后比较 naive datetime）
    from datetime import datetime as _dt

    actual = _dt.fromisoformat(body["completed_at"].replace("Z", "+00:00"))
    expected = _dt.fromisoformat(custom_ts.replace("Z", "+00:00"))
    # SQLite 不保留 tzinfo，比较时统一去掉 tzinfo
    assert actual.replace(tzinfo=None) == expected.replace(tzinfo=None)


@pytest.mark.asyncio
async def test_patch_title_only_does_not_touch_completed_fields(
    client, auth_headers
):
    """只更新 title（不传 status）时，completed/completed_at 不应被改动。"""
    task = await _create_task(client, auth_headers, "untouched")
    task_id = task["id"]

    # 先标完成，建立 completed=True / completed_at=non-null 基线
    await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "completed"},
        headers=auth_headers,
    )

    # 再只改 title
    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "renamed after complete"},
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["title"] == "renamed after complete"
    # completed 状态保持
    assert body["status"] == "completed"
    assert body["completed"] is True
    assert body["completed_at"] is not None


@pytest.mark.asyncio
async def test_patch_status_in_progress_clears_completed_fields(client, auth_headers):
    """status -> in-progress（非 completed 的中间态）也应清除 completed 标记。"""
    task = await _create_task(client, auth_headers, "in progress path")
    task_id = task["id"]

    # 先完成
    await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "completed"},
        headers=auth_headers,
    )

    # 再改为 in-progress
    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "in-progress"},
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "in-progress"
    assert body["completed"] is False
    assert body["completed_at"] is None


# ===== 列表过滤与排序测试 =====


@pytest.mark.asyncio
async def test_list_tasks_filter_by_status(client, auth_headers):
    """list_tasks 按 status 过滤只返回匹配项。"""
    await _create_task(client, auth_headers, "todo task")
    done = await _create_task(client, auth_headers, "done task")
    await client.patch(
        f"/api/v1/tasks/{done['id']}",
        json={"status": "completed"},
        headers=auth_headers,
    )

    resp = await client.get(
        "/api/v1/tasks/?status=completed", headers=auth_headers
    )
    assert resp.status_code == 200
    items = resp.json()
    assert all(t["status"] == "completed" for t in items)
    assert any(t["id"] == done["id"] for t in items)


@pytest.mark.asyncio
async def test_list_tasks_filter_by_priority(client, auth_headers):
    """list_tasks 按 priority 过滤。"""
    high = await _create_task(client, auth_headers, "high task")
    await client.patch(
        f"/api/v1/tasks/{high['id']}",
        json={"priority": "high"},
        headers=auth_headers,
    )
    await _create_task(client, auth_headers, "medium task")

    resp = await client.get(
        "/api/v1/tasks/?priority=high", headers=auth_headers
    )
    assert resp.status_code == 200
    items = resp.json()
    assert all(t["priority"] == "high" for t in items)
    assert any(t["id"] == high["id"] for t in items)


@pytest.mark.asyncio
async def test_list_tasks_filter_by_completed(client, auth_headers):
    """list_tasks 按 completed 布尔过滤。"""
    done = await _create_task(client, auth_headers, "completed one")
    await client.patch(
        f"/api/v1/tasks/{done['id']}",
        json={"status": "completed"},
        headers=auth_headers,
    )
    await _create_task(client, auth_headers, "pending one")

    resp = await client.get(
        "/api/v1/tasks/?completed=false", headers=auth_headers
    )
    assert resp.status_code == 200
    items = resp.json()
    assert all(t["completed"] is False for t in items)

    resp_done = await client.get(
        "/api/v1/tasks/?completed=true", headers=auth_headers
    )
    done_items = resp_done.json()
    assert all(t["completed"] is True for t in done_items)


@pytest.mark.asyncio
async def test_list_tasks_sort_by_title_asc(client, auth_headers):
    """list_tasks 按 title 升序排序。"""
    await _create_task(client, auth_headers, "zebra")
    await _create_task(client, auth_headers, "apple")
    await _create_task(client, auth_headers, "mango")

    resp = await client.get(
        "/api/v1/tasks/?sort_by=title&sort_order=asc", headers=auth_headers
    )
    assert resp.status_code == 200
    titles = [t["title"] for t in resp.json()]
    assert titles == sorted(titles)


@pytest.mark.asyncio
async def test_list_tasks_exclude_archived_by_default(client, auth_headers):
    """list_tasks 默认排除已归档任务。"""
    archived = await _create_task(client, auth_headers, "archived task")
    await client.patch(
        f"/api/v1/tasks/{archived['id']}",
        json={"is_archived": True},
        headers=auth_headers,
    )
    await _create_task(client, auth_headers, "normal task")

    resp = await client.get("/api/v1/tasks/", headers=auth_headers)
    items = resp.json()
    assert all(not t["is_archived"] for t in items)

    resp_all = await client.get(
        "/api/v1/tasks/?include_archived=true", headers=auth_headers
    )
    all_items = resp_all.json()
    assert any(t["id"] == archived["id"] for t in all_items)
