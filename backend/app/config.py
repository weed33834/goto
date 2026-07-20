from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8"
    )

    # 应用基础配置
    app_name: str = "Goto Backend"
    app_version: str = "0.1.0"
    debug: bool = False

    # API 服务配置
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # CORS 配置：逗号分隔的允许来源列表
    cors_origins: str = "http://localhost:5173,http://localhost:8081"

    # 文档开关：生产环境默认关闭，可通过 ENABLE_DOCS=true 临时开启
    enable_docs: bool = False

    # 认证配置：本地桌面应用使用的轻量级 API token
    # 若未设置，启动时会自动生成并写入临时文件
    api_token: Optional[str] = None
    api_token_file: Optional[Path] = None

    # 数据库配置：基于 backend 目录的绝对路径，避免启动目录不同导致找不到文件
    _db_path = Path(__file__).resolve().parent.parent / "data" / "goto.db"
    database_url: str = f"sqlite+aiosqlite:///{_db_path}"


settings = Settings()
