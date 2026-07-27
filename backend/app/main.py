from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.api import tasks
from app.api.deps import get_current_user
from app.config import settings
from app.core.security import get_api_token_file_path, get_or_create_api_token
from app.database import engine, init_db
from app.utils.logger import logger

# OpenAPI 标签元数据：按模块分组，便于在 Swagger UI 中按业务域浏览端点
_TAGS_METADATA = [
    {
        "name": "tasks",
        "description": "任务管理：任务、项目、分类、标签的 CRUD 与软删除。",
    },
]


class RootResponse(BaseModel):
    """根路径响应：返回应用基础信息。"""

    name: str
    version: str
    status: str


class HealthResponse(BaseModel):
    """健康检查响应。"""

    status: str


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # 启动时初始化数据库并确保 API token 已生成
    await init_db()
    token = get_or_create_api_token()
    token_file = get_api_token_file_path()
    # TF-015：对非回环地址绑定给出明确安全警告。
    # 后端默认监听 127.0.0.1，若被改为 0.0.0.0 或其他网卡地址，
    # 会把仅设计给本机桌面应用调用的 API 暴露到网络，需明确提示风险。
    # 仅真正的回环/本地地址才视为安全；0.0.0.0 表示“监听所有网卡”，
    # 属于对外暴露，必须触发下面的安全告警（TF-015），不能归入回环集合。
    _loopback_hosts = {"127.0.0.1", "localhost", "::1"}
    if settings.api_host not in _loopback_hosts:
        logger.warning(
            f"API 绑定到非回环地址 {settings.api_host}，服务将对外网可访问。"
            "本后端 API token 通过本地文件传递，无 TLS/网络层鉴权加固，"
            "请确保部署在内网受信环境或通过反向代理加固。"
        )
    logger.info(
        f"Goto backend started on {settings.api_host}:{settings.api_port}"
    )
    if settings.api_token_file is not None:
        logger.info(f"API token file: {token_file}")
    else:
        logger.info(
            "API token is kept in memory. Pass it to clients via API_TOKEN env var."
        )
    logger.info(f"Health check: http://{settings.api_host}:{settings.api_port}/health")
    _ = token

    yield
    # 关闭时释放数据库连接池
    await engine.dispose()
    logger.info("Goto backend shutdown: engine disposed")

# 生产环境默认关闭交互式 API 文档与调试模式。
# TF2-010/TF2-011 修复：enable_docs 与 debug 仅在显式 DEBUG=true 时生效，
# 防止生产环境通过环境变量单独开启文档或暴露详细错误堆栈。
debug_enabled = settings.debug
# enable_docs 只在 debug 模式下才被尊重；非 debug 模式强制关闭文档
docs_enabled = debug_enabled and settings.enable_docs
docs_url = "/docs" if docs_enabled else None
redoc_url = "/redoc" if docs_enabled else None
openapi_url = "/openapi.json" if docs_enabled else None

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Goto 后端服务：提供任务、项目、分类、标签的 CRUD 管理，"
        "供桌面端通过 HTTP API 调用。与端到端加密同步链路解耦，仅作可选远程存储。"
    ),
    openapi_tags=_TAGS_METADATA,
    contact={
        "name": "Goto Security",
        "email": "security@goto.app",
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/license/mit",
    },
    # FastAPI 的 debug 参数会传播给 Starlette，开启后会向客户端返回详细异常堆栈。
    # 仅在显式 debug 模式下开启，生产环境强制 False（TF2-011）。
    debug=debug_enabled,
    lifespan=lifespan,
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
)

# 配置 CORS：从环境变量读取允许来源，禁止 "*" 与 allow_credentials 同时启用
# 通配符来源与凭证同时开启会导致任意恶意网站发起跨域请求并携带浏览器凭证。
_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
allow_credentials = True
if "*" in _origins:
    allow_credentials = False
    logger.warning(
        "CORS 配置包含通配符来源，已自动禁用 allow_credentials 以防止 CSRF 风险"
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=allow_credentials,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)


@app.get(
    "/",
    response_model=RootResponse,
    summary="获取应用信息",
    responses={
        200: {"description": "应用基础信息"},
    },
)
async def root() -> RootResponse:
    return RootResponse(
        name=settings.app_name,
        version=settings.app_version,
        status="running",
    )


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="健康检查",
    responses={
        200: {"description": "服务健康状态"},
    },
)
async def health_check() -> HealthResponse:
    return HealthResponse(status="healthy")


# 注册 API 路由，所有 /api/v1/* 端点都需要认证
app.include_router(
    tasks.router, prefix="/api/v1", dependencies=[Depends(get_current_user)]
)
