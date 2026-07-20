"""日志工具

TF-016 修复：内置敏感字段脱敏过滤器，记录前自动遮蔽 password / token /
secret / api_key / authorization 等字段的值，避免日志泄露敏感信息。
"""
import logging
import re
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Match, Optional

from app.config import settings

# 敏感字段名模式（大小写不敏感）。匹配 key=value、JSON "key":"value"、
# 以及日志中常见的 token=xxx / Authorization: Bearer xxx 等写法。
_SENSITIVE_KEY_PATTERNS = re.compile(
    r"(?i)"
    r"(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|"
    r"authorization|auth|credential|private[_-]?key|client[_-]?secret)"
)

# 形如 key=value（含引号）
_KV_PATTERN = re.compile(
    r'(["\']?)([A-Za-z0-9_\-\.]+)\1\s*[:=]\s*(["\']?)([^"\',\s\}]*)\3'
)

# Authorization: Bearer xxx
_BEARER_PATTERN = re.compile(
    r"(?i)(authorization\s*[:=]\s*)(bearer\s+)([A-Za-z0-9_\-\.=]+)"
)


def _mask_value(value: str) -> str:
    """遮蔽敏感值：保留首尾各 1 个字符，中间用 * 代替；过短直接全遮。"""
    if not value:
        return value
    if len(value) <= 4:
        return "****"
    return f"{value[0]}***{value[-1]}"


def redact(text: str) -> str:
    """对日志文本做敏感字段脱敏。"""
    if not isinstance(text, str):
        text = str(text)

    # 1. Authorization: Bearer xxx
    text = _BEARER_PATTERN.sub(
        lambda m: f"{m.group(1)}{m.group(2)}{_mask_value(m.group(3))}", text
    )

    # 2. key=value / "key":"value" 形式
    def _replace_kv(match: Match[str]) -> str:
        key = match.group(2)
        if _SENSITIVE_KEY_PATTERNS.fullmatch(key):
            quote = match.group(1)
            value_quote = match.group(3)
            masked = _mask_value(match.group(4))
            return f"{quote}{key}{quote}{value_quote}{masked}{value_quote}"
        return str(match.group(0))

    return str(_KV_PATTERN.sub(_replace_kv, text))


class RedactingFormatter(logging.Formatter):
    """在格式化日志消息时自动脱敏。"""

    def format(self, record: logging.LogRecord) -> str:
        original = record.getMessage()
        record.msg = redact(original)
        record.args = ()
        return super().format(record)


def setup_logger(name: str, log_file: Optional[str] = None) -> logging.Logger:
    """配置日志记录器"""
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)

    # 控制台输出
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)
    console_formatter = RedactingFormatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # 文件输出（可选）
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        file_handler = RotatingFileHandler(
            log_path,
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5,
            encoding='utf-8'
        )
        file_handler.setLevel(logging.DEBUG)
        file_formatter = RedactingFormatter(
            '%(asctime)s - %(name)s - %(levelname)s - '
            '%(funcName)s:%(lineno)d - %(message)s'
        )
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)

    return logger


# 默认日志记录器
logger = setup_logger("ai_dev_assistant", "logs/app.log")
