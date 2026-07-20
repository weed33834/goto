"""API 路由模块"""
from typing import Any

# 通用错误响应：所有 /api/v1/* 端点都需要认证，并可能出现参数校验失败
COMMON_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"description": "未认证或 token 无效"},
    422: {"description": "参数校验失败"},
}

# 单资源端点额外补充 404（GET/PATCH/DELETE 单个资源）
NOT_FOUND_RESPONSES: dict[int | str, dict[str, Any]] = {
    **COMMON_RESPONSES,
    404: {"description": "资源不存在"},
}

# DELETE 端点响应：204 + 通用错误 + 404
DELETE_RESPONSES: dict[int | str, dict[str, Any]] = {
    204: {"description": "删除成功"},
    401: {"description": "未认证或 token 无效"},
    404: {"description": "资源不存在"},
    422: {"description": "参数校验失败"},
}
