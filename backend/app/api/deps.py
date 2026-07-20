"""API 依赖项。"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import verify_api_token

# 使用 HTTPBearer 提取 Authorization: Bearer <token> 头
security_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_bearer),
) -> str:
    """校验 Bearer token，成功返回固定用户标识。"""
    if credentials is None or not verify_api_token(credentials.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭据",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return "goto_user"
