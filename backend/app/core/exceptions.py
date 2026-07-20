"""异常处理工具"""
from fastapi import HTTPException

from app.utils.logger import logger
from app.utils.validator import ValidationError as ValidatorValidationError


def handle_api_error(
    exc: Exception, status_code: int = 500, log_message: str | None = None
) -> HTTPException:
    """将异常转换为对客户端安全的 HTTPException，并在服务端记录完整 traceback。

    对于已知的业务校验异常（ValidationError、ValueError），返回经脱敏的
    异常消息作为 detail，便于客户端区分"参数非法"与"服务器内部错误"；
    对于未预期的异常，统一返回 "Internal server error"，避免泄露内部细节。
    """
    log_msg = log_message or "API 请求处理失败"
    logger.exception(f"{log_msg}: {exc}")

    # 已知业务异常：消息本身由开发者控制，可安全返回给客户端
    if isinstance(exc, (ValidatorValidationError, ValueError)):
        return HTTPException(status_code=status_code, detail=str(exc))

    # 未预期异常：不泄露内部细节
    return HTTPException(status_code=status_code, detail="Internal server error")
