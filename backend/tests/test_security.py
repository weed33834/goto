"""API Token 安全测试

覆盖 token 熵值校验、常量时间比较以及 get_or_create_api_token 的行为。
"""
import secrets

import pytest

from app.config import settings
from app.core import security
from app.core.security import _validate_token_entropy


@pytest.fixture(autouse=True)
def reset_token_state(monkeypatch):
    """每个测试前重置 security 模块的全局 token 状态与相关配置。

    避免缓存的 _API_TOKEN 或本地 .env 配置影响测试结果，同时保证测试
    不会向磁盘写入 token 文件。
    """
    monkeypatch.setattr(security, "_API_TOKEN", None)
    monkeypatch.setattr(security, "_TOKEN_FILE_PATH", None)
    monkeypatch.setattr(settings, "api_token", None)
    monkeypatch.setattr(settings, "api_token_file", None)
    yield


def test_validate_token_entropy_rejects_short_token():
    """低于 32 字节的 token 应被拒绝。"""
    with pytest.raises(ValueError, match="至少为 32 字节"):
        _validate_token_entropy("a" * 31)


def test_validate_token_entropy_rejects_empty_token():
    """空 token 应被拒绝。"""
    with pytest.raises(ValueError):
        _validate_token_entropy("")


def test_validate_token_entropy_accepts_long_token():
    """达到 32 字节阈值的 token 应被接受。"""
    # 恰好 32 字节，边界值
    _validate_token_entropy("a" * 32)
    # token_urlsafe(32) 生成约 43 个 ASCII 字符，远超阈值
    _validate_token_entropy(secrets.token_urlsafe(32))


def test_verify_api_token_uses_constant_time_compare(monkeypatch):
    """verify_api_token 必须通过 secrets.compare_digest 做常量时间比较。"""
    token = secrets.token_urlsafe(32)
    monkeypatch.setattr(settings, "api_token", token)

    compare_calls = []
    real_compare = secrets.compare_digest

    def tracking_compare(a: str, b: str) -> bool:
        compare_calls.append((a, b))
        return real_compare(a, b)

    monkeypatch.setattr(security.secrets, "compare_digest", tracking_compare)

    assert security.verify_api_token(token) is True
    assert security.verify_api_token("wrong-token-value") is False

    # 确认比较确实走了 secrets.compare_digest（常量时间比较）而非 ==
    assert len(compare_calls) == 2
    assert compare_calls[0] == (token, token)


def test_get_or_create_api_token_auto_generates_when_no_injection():
    """无外部注入时，get_or_create_api_token 应自动生成高熵 token。"""
    token = security.get_or_create_api_token()

    assert token is not None
    assert len(token.encode("utf-8")) >= 32
    # 再次调用应返回同一个 token（缓存）
    assert security.get_or_create_api_token() == token


def test_get_or_create_api_token_rejects_short_injected(monkeypatch):
    """注入短 token 时，get_or_create_api_token 应抛出 ValueError。"""
    monkeypatch.setattr(settings, "api_token", "short-token")

    with pytest.raises(ValueError, match="至少为 32 字节"):
        security.get_or_create_api_token()

    # 校验失败后不应缓存无效 token
    assert security._API_TOKEN is None


def test_get_or_create_api_token_accepts_valid_injected(monkeypatch):
    """注入合规长度 token 时应被采用。"""
    token = secrets.token_urlsafe(32)
    monkeypatch.setattr(settings, "api_token", token)

    assert security.get_or_create_api_token() == token
    assert security.verify_api_token(token) is True
