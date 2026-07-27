"""app/main.py 单元测试

测试应用创建、路由注册、健康检查端点、根路径、鉴权拦截与 CORS 中间件配置。

注意：使用 httpx 的 ASGITransport 不会自动触发 FastAPI 的 lifespan
（即 init_db / engine.dispose），因此不会触碰真实数据库。对于需要 get_db
的 /api/v1/* 端点，这里只验证未通过鉴权时返回 401，不会真正执行
端点体，故用空会话替换 get_db 即可。
"""
import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core import security
from app.database import Base, get_db
from app.main import HealthResponse, RootResponse, app

# 与 tests/integration/test_api.py 一致的高熵测试 token
TEST_API_TOKEN = "tF8kQ2mP9vX4nL7bR5wJ3cY6hA1sE0dU4iO2pK5lN8jH3gF7qT9zC6xV2yB5"


@pytest.fixture(autouse=True)
def fixed_api_token(monkeypatch):
    """固定测试用 API token，避免受本地临时文件影响。"""
    monkeypatch.setattr(settings, "api_token", TEST_API_TOKEN)
    monkeypatch.setattr(settings, "api_token_file", None)
    monkeypatch.setattr(security, "_API_TOKEN", None)


@pytest_asyncio.fixture
async def client():
    """创建测试客户端。

    使用内存 sqlite 建表，并通过 dependency_overrides 注入会话，
    避免触碰真实的 backend/data/goto.db。
    """
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
    await engine.dispose()


def test_app_is_fastapi_instance():
    """app 应为 FastAPI 实例。"""
    assert isinstance(app, FastAPI)


def test_app_metadata_matches_settings():
    """应用的 title / version 应来自 settings。"""
    assert app.title == settings.app_name
    assert app.version == settings.app_version


def test_top_level_routes_registered():
    """根路径与健康检查应作为顶层路由注册在 app.routes 上。"""
    # app.routes 中顶层 APIRoute 暴露 path 属性；
    # include_router 注册的路由在新版 Starlette 中包在 _IncludedRouter 内，
    # 这里只校验顶层路由，/api/v1/* 的注册由行为测试覆盖。
    paths = {route.path for route in app.routes if hasattr(route, "path")}
    assert "/" in paths
    assert "/health" in paths


@pytest.mark.asyncio
async def test_api_v1_tasks_route_is_wired(client):
    """/api/v1/tasks/* 路由应已挂载：访问时返回 401（鉴权失败）而非 404（未注册）。"""
    response = await client.get("/api/v1/tasks/")
    assert response.status_code != 404
    assert response.status_code == 401


def test_response_models_bound():
    """根路径与健康检查端点应绑定正确的响应模型。"""
    root_route = next(r for r in app.routes if getattr(r, "path", None) == "/")
    health_route = next(r for r in app.routes if getattr(r, "path", None) == "/health")
    assert root_route.response_model is RootResponse
    assert health_route.response_model is HealthResponse


@pytest.mark.asyncio
async def test_health_check_returns_healthy(client):
    """GET /health 应返回 200 与 {"status": "healthy"}。"""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


@pytest.mark.asyncio
async def test_root_returns_app_info(client):
    """GET / 应返回 200，包含 name / version / status=running。"""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == settings.app_name
    assert data["version"] == settings.app_version
    assert data["status"] == "running"


@pytest.mark.asyncio
async def test_api_v1_requires_auth(client):
    """未提供 token 访问 /api/v1/* 应返回 401。"""
    response = await client.get("/api/v1/tasks/")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_api_v1_rejects_invalid_token(client):
    """提供非法 token 访问 /api/v1/* 应返回 401。"""
    response = await client.get(
        "/api/v1/tasks/", headers={"Authorization": "Bearer invalid-token"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_api_v1_accepts_valid_token(client):
    """提供有效 token 时 /api/v1/* 鉴权应通过（不再返回 401）。"""
    response = await client.get(
        "/api/v1/tasks/", headers={"Authorization": f"Bearer {TEST_API_TOKEN}"}
    )
    # 鉴权通过后不应是 401；具体业务状态码（200 等）由 integration 测试覆盖
    assert response.status_code != 401


def test_cors_middleware_present():
    """CORS 中间件应已挂载。"""
    from starlette.middleware.cors import CORSMiddleware

    middleware_classes = {m.cls for m in app.user_middleware}
    assert CORSMiddleware in middleware_classes


def test_docs_disabled_by_default():
    """非 debug 模式下交互式文档应关闭（docs/redoc/openapi URL 为 None）。"""
    # 默认 settings.debug 为 False，对应 docs_url 应为 None
    if not settings.debug:
        assert app.docs_url is None
        assert app.redoc_url is None
        assert app.openapi_url is None
