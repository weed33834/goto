"""API token 生成与校验。

本模块为本地桌面应用提供轻量级认证：
- 启动时生成一个高熵随机 token（也可通过环境变量注入）。
- 将 token 写入本地已知位置的临时文件，便于桌面端读取。
- 通过 HTTP Bearer 头校验请求。

注意：该方案仅适用于后端绑定在 127.0.0.1 的本地单用户场景。
"""
import secrets
import tempfile
from pathlib import Path

from app.config import settings
from app.utils.logger import logger

_API_TOKEN: str | None = None
_TOKEN_FILE_PATH: Path | None = None


def _token_file_path() -> Path:
    """返回 token 文件路径。

    优先级：
    1. API_TOKEN_FILE / settings.api_token_file
    2. 系统临时目录下的 goto_api_token.txt
    """
    if settings.api_token_file is not None:
        return settings.api_token_file.resolve()
    return Path(tempfile.gettempdir()) / "goto_api_token.txt"


def generate_api_token() -> str:
    """生成新的随机 API token。"""
    return secrets.token_urlsafe(32)


_MIN_TOKEN_ENTROPY_BYTES = 32


def _validate_token_entropy(token: str) -> None:
    """校验外部注入的 token 具有足够熵值，防止使用短 token 或常见字符串。"""
    if not token or len(token.encode("utf-8")) < _MIN_TOKEN_ENTROPY_BYTES:
        raise ValueError(
            f"API token 长度至少为 {_MIN_TOKEN_ENTROPY_BYTES} 字节，"
            "请使用 secrets.token_urlsafe(32) 或等价高熵源生成"
        )


def get_or_create_api_token() -> str:
    """获取当前 API token；如未初始化则生成新的内存 token。

    安全设计：
    - 默认从环境变量 API_TOKEN 读取，避免在磁盘上明文存储 token。
    - 若未设置环境变量，则在内存中生成随机 token；调用方（如桌面端启动器）
      应负责通过环境变量将该 token 传递给后端。
    - 仅在显式配置了 API_TOKEN_FILE 时才会把 token 写入文件，用于
      需要固定文件路径的特殊部署场景；此时仍建议配合严格的文件权限控制。
    - 外部注入的 token 会被校验熵值，过短的 token 将触发启动失败。
    """
    global _API_TOKEN
    if _API_TOKEN is not None:
        return _API_TOKEN

    # 优先从 settings.api_token 读取，这是推荐的安全用法
    if settings.api_token:
        _validate_token_entropy(settings.api_token)
        _API_TOKEN = settings.api_token
        logger.info("API token 已从配置加载")
        return _API_TOKEN

    # 生成内存 token；不默认写入磁盘，避免 clear-text storage 风险
    _API_TOKEN = generate_api_token()

    # 仅在显式配置文件路径时才持久化
    if settings.api_token_file is not None:
        token_file = settings.api_token_file.resolve()
        try:
            token_file.write_text(_API_TOKEN, encoding="utf-8")
            token_file.chmod(0o600)
            logger.info(f"已生成新的 API token 并写入: {token_file}")
        except OSError as exc:
            logger.warning(f"无法写入 token 文件: {exc}")
    else:
        logger.info("已生成新的内存 API token；请通过 API_TOKEN 环境变量传递给客户端")

    return _API_TOKEN


def get_api_token_file_path() -> Path:
    """返回当前使用的 token 文件路径。"""
    global _TOKEN_FILE_PATH
    if _TOKEN_FILE_PATH is None:
        _TOKEN_FILE_PATH = _token_file_path()
    return _TOKEN_FILE_PATH


def verify_api_token(token: str) -> bool:
    """校验提供的 token 是否与当前有效 token 一致。"""
    expected = get_or_create_api_token()
    if not expected:
        return False
    return secrets.compare_digest(expected, token)
