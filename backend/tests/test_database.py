"""app/database.py 单元测试

测试数据库初始化、表创建与会话管理（提交/回滚）。

约束：
- 全程使用临时 sqlite 文件（pytest 的 tmp_path），绝不触碰 backend/data/*.db。
- 通过 monkeypatch 替换 app.database 模块级的 engine / async_session，
  使 init_db / get_db 走临时引擎；测试结束 monkeypatch 自动还原。
"""
import pytest
import pytest_asyncio
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

import app.database as db_module
from app.models.task import Task

# init_db / get_db 在调用时按模块全局查找 engine / async_session，
# 因此 monkeypatch 替换模块属性即可让它们使用临时引擎。


@pytest_asyncio.fixture
async def temp_db(monkeypatch, tmp_path):
    """构造临时 sqlite 数据库并替换 app.database 的全局 engine/async_session。"""
    db_file = tmp_path / "test_unit.db"
    db_url = f"sqlite+aiosqlite:///{db_file}"

    test_engine = create_async_engine(db_url, echo=False)
    test_session_factory = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )

    # 替换模块级全局，使 init_db / get_db 使用临时引擎
    monkeypatch.setattr(db_module, "engine", test_engine)
    monkeypatch.setattr(db_module, "async_session", test_session_factory)

    yield test_engine, test_session_factory

    await test_engine.dispose()


def test_module_engine_is_async_engine():
    """模块级 engine 应为 AsyncEngine 实例。"""
    assert isinstance(db_module.engine, AsyncEngine)


def test_module_async_session_is_sessionmaker():
    """模块级 async_session 应为可调用，调用后产出 AsyncSession。"""
    # async_session 是 async_sessionmaker 实例，可调用
    assert callable(db_module.async_session)


@pytest.mark.asyncio
async def test_init_db_creates_all_tables(temp_db):
    """init_db 应创建 tasks / projects / categories / tags 四张表。"""
    test_engine, _ = temp_db
    await db_module.init_db()

    async with test_engine.begin() as conn:
        table_names = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).get_table_names()
        )
    assert set(table_names) >= {"tasks", "projects", "categories", "tags"}


@pytest.mark.asyncio
async def test_init_db_idempotent(temp_db):
    """多次调用 init_db 不应报错（create_all 默认 checkfirst=True）。"""
    test_engine, _ = temp_db
    await db_module.init_db()
    # 第二次调用应安全
    await db_module.init_db()

    async with test_engine.begin() as conn:
        table_names = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).get_table_names()
        )
    assert "tasks" in table_names


@pytest.mark.asyncio
async def test_get_db_yields_async_session(temp_db):
    """get_db 产出的对象应为 AsyncSession 实例。"""
    await db_module.init_db()
    gen = db_module.get_db()
    session = await gen.__anext__()
    assert isinstance(session, AsyncSession)
    # 用 aclose 关闭生成器（不触发 commit，仅清理资源）
    await gen.aclose()


@pytest.mark.asyncio
async def test_get_db_commits_on_success(temp_db):
    """请求正常完成时 get_db 应提交事务，数据持久化。"""
    test_engine, test_session_factory = temp_db
    await db_module.init_db()

    gen = db_module.get_db()
    session = await gen.__anext__()
    session.add(Task(id="t-commit", title="提交测试"))

    # 模拟请求结束：恢复生成器，触发 yield 之后的 commit
    with pytest.raises(StopAsyncIteration):
        await gen.__anext__()

    # 新会话查询，验证已提交
    async with test_session_factory() as q:
        result = await q.execute(select(Task).where(Task.id == "t-commit"))
        assert result.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_get_db_rolls_back_on_exception(temp_db):
    """请求抛异常时 get_db 应回滚事务，数据不持久化。"""
    test_engine, test_session_factory = temp_db
    await db_module.init_db()

    gen = db_module.get_db()
    session = await gen.__anext__()
    session.add(Task(id="t-rollback", title="回滚测试"))

    # 模拟端点抛异常：把异常注入生成器，触发 except 分支回滚并重新抛出
    with pytest.raises(RuntimeError):
        await gen.athrow(RuntimeError("boom"))

    # 新会话查询，验证未提交
    async with test_session_factory() as q:
        result = await q.execute(select(Task).where(Task.id == "t-rollback"))
        assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_get_db_exception_propagates(temp_db):
    """get_db 在异常路径下应把异常原样向上传播。"""
    await db_module.init_db()
    gen = db_module.get_db()
    await gen.__anext__()

    # 注入 ValueError，期望被重新抛出
    with pytest.raises(ValueError):
        await gen.athrow(ValueError("custom error"))
