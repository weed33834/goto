from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.base import Base

# Ensure the directory for the SQLite database exists before the engine tries
# to open the file. This makes the backend robust to whichever working directory
# is used to start uvicorn.
_db_path = Path(settings.database_url.replace("sqlite+aiosqlite:///", "")).resolve()
_db_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


async def init_db() -> None:
    """初始化数据库，创建所有表"""
    # Import models here so Base.metadata knows about all tables, without
    # creating a circular import at module load time.
    from app.models import task as _task_models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """获取数据库会话"""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
