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
    resp = await client.get(f"/api/v1/tasks/projects/{project_id}", headers=auth_headers)
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
    resp = await client.delete(f"/api/v1/tasks/projects/{project_id}", headers=auth_headers)
    assert resp.status_code == 204

    # 删除后读取应 404
    resp = await client.get(f"/api/v1/tasks/projects/{project_id}", headers=auth_headers)
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
