"""项目 / 分类 / 标签 CRUD 集成测试

覆盖 tasks 路由下的 projects / categories / tags 子资源的增删改查闭环。
"""
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core import security
from app.database import Base, get_db
from app.main import app

TEST_API_TOKEN = "tF8kQ2mP9vX4nL7bR5wJ3cY6hA1sE0dU4iO2pK5lN8jH3gF7qT9zC6xV2yB5"


@pytest.fixture(autouse=True)
def fixed_api_token(monkeypatch):
    monkeypatch.setattr(settings, "api_token", TEST_API_TOKEN)
    monkeypatch.setattr(settings, "api_token_file", None)
    monkeypatch.setattr(security, "_API_TOKEN", None)


@pytest_asyncio.fixture
async def db_session():
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
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {TEST_API_TOKEN}"}


# ===== Project CRUD =====


@pytest.mark.asyncio
async def test_project_full_crud(client, auth_headers):
    """Project 创建→读取→更新→删除闭环。"""
    # 创建
    resp = await client.post(
        "/api/v1/tasks/projects/",
        json={"name": "My Project", "color": "#ff0000"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    project = resp.json()
    project_id = project["id"]
    assert project["name"] == "My Project"
    assert project["color"] == "#ff0000"

    # 读取列表
    resp = await client.get("/api/v1/tasks/projects/", headers=auth_headers)
    assert resp.status_code == 200
    assert any(p["id"] == project_id for p in resp.json())

    # 读取详情
    resp = await client.get(
        f"/api/v1/tasks/projects/{project_id}", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "My Project"

    # 更新
    resp = await client.patch(
        f"/api/v1/tasks/projects/{project_id}",
        json={"name": "Renamed Project"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed Project"

    # 删除
    resp = await client.delete(
        f"/api/v1/tasks/projects/{project_id}", headers=auth_headers
    )
    assert resp.status_code == 204

    # 删除后读取应 404
    resp = await client.get(
        f"/api/v1/tasks/projects/{project_id}", headers=auth_headers
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_project_get_not_found(client, auth_headers):
    """不存在的 project 返回 404。"""
    resp = await client.get(
        "/api/v1/tasks/projects/no-such-project", headers=auth_headers
    )
    assert resp.status_code == 404


# ===== Category CRUD =====


@pytest.mark.asyncio
async def test_category_full_crud(client, auth_headers):
    """Category 创建→读取→更新→删除闭环。"""
    resp = await client.post(
        "/api/v1/tasks/categories/",
        json={"name": "Work", "color": "#3b82f6"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    category = resp.json()
    category_id = category["id"]
    assert category["name"] == "Work"

    resp = await client.get("/api/v1/tasks/categories/", headers=auth_headers)
    assert resp.status_code == 200
    assert any(c["id"] == category_id for c in resp.json())

    resp = await client.get(
        f"/api/v1/tasks/categories/{category_id}", headers=auth_headers
    )
    assert resp.status_code == 200

    resp = await client.patch(
        f"/api/v1/tasks/categories/{category_id}",
        json={"name": "Personal"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Personal"

    resp = await client.delete(
        f"/api/v1/tasks/categories/{category_id}", headers=auth_headers
    )
    assert resp.status_code == 204

    resp = await client.get(
        f"/api/v1/tasks/categories/{category_id}", headers=auth_headers
    )
    assert resp.status_code == 404


# ===== Tag CRUD =====


@pytest.mark.asyncio
async def test_tag_full_crud(client, auth_headers):
    """Tag 创建→读取→更新→删除闭环。"""
    resp = await client.post(
        "/api/v1/tasks/tags/",
        json={"name": "urgent-tag", "color": "#ef4444"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    tag = resp.json()
    tag_id = tag["id"]
    assert tag["name"] == "urgent-tag"

    resp = await client.get("/api/v1/tasks/tags/", headers=auth_headers)
    assert resp.status_code == 200
    assert any(t["id"] == tag_id for t in resp.json())

    resp = await client.get(f"/api/v1/tasks/tags/{tag_id}", headers=auth_headers)
    assert resp.status_code == 200

    resp = await client.patch(
        f"/api/v1/tasks/tags/{tag_id}",
        json={"color": "#00ff00"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["color"] == "#00ff00"

    resp = await client.delete(f"/api/v1/tasks/tags/{tag_id}", headers=auth_headers)
    assert resp.status_code == 204

    resp = await client.get(f"/api/v1/tasks/tags/{tag_id}", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tag_get_not_found(client, auth_headers):
    """不存在的 tag 返回 404。"""
    resp = await client.get("/api/v1/tasks/tags/no-such-tag", headers=auth_headers)
    assert resp.status_code == 404


# ===== Project / Category 任务统计 (P1-2) =====
#
# 验证 list_projects / get_project 返回的 task_count / completed_task_count /
# progress 与实际任务数据一致;list_categories / get_category 返回 task_count。


@pytest.mark.asyncio
async def test_project_stats_reflect_real_tasks(client, auth_headers):
    """Project 统计字段应反映未删除/未归档任务的真实数量与完成进度。"""
    # 1. 创建项目
    resp = await client.post(
        "/api/v1/tasks/projects/",
        json={"name": "Stats Project"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["id"]

    # 2. 列表查询:无任务时统计应为 0
    resp = await client.get("/api/v1/tasks/projects/", headers=auth_headers)
    p = next(x for x in resp.json() if x["id"] == project_id)
    assert p["task_count"] == 0
    assert p["completed_task_count"] == 0
    assert p["progress"] == 0

    # 3. 创建 3 个任务,2 个完成
    for i in range(3):
        resp = await client.post(
            "/api/v1/tasks/",
            json={"title": f"task-{i}", "project_id": project_id},
            headers=auth_headers,
        )
        assert resp.status_code == 201, resp.text
        task_id = resp.json()["id"]
        if i < 2:
            # 标记完成
            resp = await client.patch(
                f"/api/v1/tasks/{task_id}",
                json={"status": "completed"},
                headers=auth_headers,
            )
            assert resp.status_code == 200, resp.text

    # 4. 列表查询:统计应为 total=3, completed=2, progress=66
    resp = await client.get("/api/v1/tasks/projects/", headers=auth_headers)
    p = next(x for x in resp.json() if x["id"] == project_id)
    assert p["task_count"] == 3
    assert p["completed_task_count"] == 2
    assert p["progress"] == 66  # int(2 * 100 / 3) = 66

    # 5. 详情查询:同样反映统计
    resp = await client.get(
        f"/api/v1/tasks/projects/{project_id}", headers=auth_headers
    )
    assert resp.status_code == 200
    p = resp.json()
    assert p["task_count"] == 3
    assert p["completed_task_count"] == 2
    assert p["progress"] == 66

    # 6. 软删除一个"已完成"任务:total 应减 1,completed 也应减 1
    #    (任务列表的返回顺序不保证与插入顺序一致,因此显式找出 status=completed 的任务)
    resp = await client.get(
        "/api/v1/tasks/",
        params={"project_id": project_id},
        headers=auth_headers,
    )
    completed_task_id = next(
        t["id"] for t in resp.json() if t["status"] == "completed"
    )
    resp = await client.delete(
        f"/api/v1/tasks/{completed_task_id}", headers=auth_headers
    )
    assert resp.status_code == 204

    resp = await client.get(
        f"/api/v1/tasks/projects/{project_id}", headers=auth_headers
    )
    p = resp.json()
    # 删除一个已完成任务后:total=2, completed=1
    assert p["task_count"] == 2
    assert p["completed_task_count"] == 1


@pytest.mark.asyncio
async def test_project_stats_excludes_archived_tasks(client, auth_headers):
    """归档任务不计入 Project 统计。"""
    resp = await client.post(
        "/api/v1/tasks/projects/",
        json={"name": "Archive Project"},
        headers=auth_headers,
    )
    project_id = resp.json()["id"]

    # 创建 2 个任务,归档 1 个
    for i in range(2):
        await client.post(
            "/api/v1/tasks/",
            json={"title": f"t-{i}", "project_id": project_id},
            headers=auth_headers,
        )
    # 取第一个任务归档
    resp = await client.get(
        "/api/v1/tasks/",
        params={"project_id": project_id, "include_archived": True},
        headers=auth_headers,
    )
    first_id = resp.json()[0]["id"]
    resp = await client.patch(
        f"/api/v1/tasks/{first_id}",
        json={"is_archived": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200

    resp = await client.get(
        f"/api/v1/tasks/projects/{project_id}", headers=auth_headers
    )
    p = resp.json()
    # 归档的不算,total 应为 1
    assert p["task_count"] == 1


@pytest.mark.asyncio
async def test_category_returns_task_count(client, auth_headers):
    """Category 列表与详情应返回 task_count 字段,反映真实任务数。"""
    resp = await client.post(
        "/api/v1/tasks/categories/",
        json={"name": "Work"},
        headers=auth_headers,
    )
    category_id = resp.json()["id"]

    # 列表查询:返回 task_count 字段且为 0
    resp = await client.get("/api/v1/tasks/categories/", headers=auth_headers)
    c = next(x for x in resp.json() if x["id"] == category_id)
    assert c["task_count"] == 0

    # 创建 2 个任务挂到此分类
    for i in range(2):
        await client.post(
            "/api/v1/tasks/",
            json={"title": f"c-task-{i}", "category_id": category_id},
            headers=auth_headers,
        )

    # 列表查询:task_count 应为 2
    resp = await client.get("/api/v1/tasks/categories/", headers=auth_headers)
    c = next(x for x in resp.json() if x["id"] == category_id)
    assert c["task_count"] == 2

    # 详情查询:同样反映 task_count
    resp = await client.get(
        f"/api/v1/tasks/categories/{category_id}", headers=auth_headers
    )
    assert resp.json()["task_count"] == 2


# ===== Tag usage_count 自动维护 (P1-3) =====
#
# 验证任务创建/更新/删除时,被引用 tag 的 usage_count 自动同步。


@pytest.mark.asyncio
async def test_tag_usage_count_updates_on_task_create(client, auth_headers):
    """创建带 tag 的任务后,Tag.usage_count 应反映被引用次数。"""
    # 1. 创建一个 Tag
    resp = await client.post(
        "/api/v1/tasks/tags/",
        json={"name": "mytag"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    tag_id = resp.json()["id"]
    assert resp.json()["usage_count"] == 0

    # 2. 创建 2 个任务都引用此 tag(通过 tags 数组,值是 tag 名)
    for i in range(2):
        resp = await client.post(
            "/api/v1/tasks/",
            json={"title": f"tagged-{i}", "tags": ["mytag"]},
            headers=auth_headers,
        )
        assert resp.status_code == 201, resp.text

    # 3. 重新查询 Tag,usage_count 应为 2
    resp = await client.get("/api/v1/tasks/tags/", headers=auth_headers)
    t = next(x for x in resp.json() if x["id"] == tag_id)
    assert t["usage_count"] == 2


@pytest.mark.asyncio
async def test_tag_usage_count_updates_on_task_delete(client, auth_headers):
    """删除带 tag 的任务后,Tag.usage_count 应减回。"""
    # 1. 创建 Tag + 1 个引用它的任务
    await client.post(
        "/api/v1/tasks/tags/",
        json={"name": "deletetag"},
        headers=auth_headers,
    )
    resp = await client.post(
        "/api/v1/tasks/",
        json={"title": "will be deleted", "tags": ["deletetag"]},
        headers=auth_headers,
    )
    task_id = resp.json()["id"]

    # 确认 usage_count=1
    resp = await client.get("/api/v1/tasks/tags/", headers=auth_headers)
    t = next(x for x in resp.json() if x["name"] == "deletetag")
    assert t["usage_count"] == 1

    # 2. 删除任务,usage_count 应回到 0
    resp = await client.delete(f"/api/v1/tasks/{task_id}", headers=auth_headers)
    assert resp.status_code == 204
    resp = await client.get("/api/v1/tasks/tags/", headers=auth_headers)
    t = next(x for x in resp.json() if x["name"] == "deletetag")
    assert t["usage_count"] == 0


@pytest.mark.asyncio
async def test_tag_usage_count_updates_on_task_tags_change(client, auth_headers):
    """修改任务 tags 字段后,相关 Tag.usage_count 应同步增减。"""
    # 1. 创建两个 Tag
    await client.post(
        "/api/v1/tasks/tags/",
        json={"name": "tagA"},
        headers=auth_headers,
    )
    await client.post(
        "/api/v1/tasks/tags/",
        json={"name": "tagB"},
        headers=auth_headers,
    )

    # 2. 创建任务只带 tagA
    resp = await client.post(
        "/api/v1/tasks/",
        json={"title": "tag-changer", "tags": ["tagA"]},
        headers=auth_headers,
    )
    task_id = resp.json()["id"]

    resp = await client.get("/api/v1/tasks/tags/", headers=auth_headers)
    by_name = {t["name"]: t["usage_count"] for t in resp.json()}
    assert by_name["tagA"] == 1
    assert by_name["tagB"] == 0

    # 3. 修改任务 tags 为 [tagA, tagB]
    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"tags": ["tagA", "tagB"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    resp = await client.get("/api/v1/tasks/tags/", headers=auth_headers)
    by_name = {t["name"]: t["usage_count"] for t in resp.json()}
    assert by_name["tagA"] == 1
    assert by_name["tagB"] == 1

    # 4. 修改任务 tags 为 [tagB](移除 tagA)
    resp = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"tags": ["tagB"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    resp = await client.get("/api/v1/tasks/tags/", headers=auth_headers)
    by_name = {t["name"]: t["usage_count"] for t in resp.json()}
    assert by_name["tagA"] == 0
    assert by_name["tagB"] == 1


@pytest.mark.asyncio
async def test_tag_update_accepts_is_system_and_usage_count(client, auth_headers):
    """TagUpdate schema 应接受 is_system / usage_count 字段(B-5)。"""
    resp = await client.post(
        "/api/v1/tasks/tags/",
        json={"name": "systag"},
        headers=auth_headers,
    )
    tag_id = resp.json()["id"]

    # 设置 is_system=True, usage_count=42
    resp = await client.patch(
        f"/api/v1/tasks/tags/{tag_id}",
        json={"is_system": True, "usage_count": 42},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_system"] is True
    assert body["usage_count"] == 42
