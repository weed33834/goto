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

    # CORS 配置：逗号分隔的允许来源列表(补全 127.0.0.1 与移动端 5174 源)
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:8081"

    # token 引导开关:本地优先单用户模型下,前端经 /api/bootstrap/token 自动获取
    # Bearer token。仅当客户端为回环地址(127.0.0.1/::1)且该开关开启时下发,
    # 生产/多用户部署应设为 False 避免 token 泄露。
    allow_token_bootstrap: bool = True

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
