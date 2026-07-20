"""API 集成测试"""
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.core import security
from app.database import Base, get_db
from app.main import app

# 使用高熵测试 token，匹配生产环境对 API token 长度的校验
TEST_API_TOKEN = "tF8kQ2mP9vX4nL7bR5wJ3cY6hA1sE0dU4iO2pK5lN8jH3gF7qT9zC6xV2yB5"


@pytest.fixture(autouse=True)
def fixed_api_token(monkeypatch):
    """固定测试用 API token，避免受本地临时文件影响。"""
    monkeypatch.setattr(settings, "api_token", TEST_API_TOKEN)
    monkeypatch.setattr(settings, "api_token_file", None)
    monkeypatch.setattr(security, "_API_TOKEN", None)


@pytest_asyncio.fixture
async def db_session():
    """创建测试数据库会话"""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    """创建测试客户端"""
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


@pytest.mark.asyncio
async def test_health_check(client):
    """测试健康检查接口"""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


@pytest.mark.asyncio
async def test_root(client):
    """测试根路径"""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "version" in data
    assert data["status"] == "running"


@pytest.mark.asyncio
async def test_api_v1_requires_auth(client):
    """测试 /api/v1/* 接口未提供 token 时返回 401"""
    # 用 tasks 列表端点验证鉴权拦截
    response = await client.get("/api/v1/tasks/")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_api_v1_rejects_invalid_token(client):
    """测试 /api/v1/* 接口提供错误 token 时返回 401"""
    response = await client.get(
        "/api/v1/tasks/", headers={"Authorization": "Bearer invalid-token"}
    )
    assert response.status_code == 401
