"""CORS 配置测试

验证 main.py 中的 CORS 安全逻辑：当允许来源包含通配符 "*" 时，
allow_credentials 必须被自动禁用，以防止任意恶意网站携带浏览器凭证
发起跨域请求而导致的 CSRF 风险。
"""
import importlib

import pytest

from app.config import settings


@pytest.fixture
def reload_main():
    """返回工厂函数：以指定 cors_origins 重新加载 app.main。

    CORS 配置在 app.main 导入时一次性计算，因此通过 reload 来用不同的
    cors_origins 重新执行该决策逻辑。teardown 阶段先恢复原始 settings，
    再重新加载 app.main，避免污染其他测试用例。
    """
    original_origins = settings.cors_origins

    def _reload(origins: str):
        settings.cors_origins = origins
        import app.main
        return importlib.reload(app.main)

    yield _reload

    settings.cors_origins = original_origins
    import app.main
    importlib.reload(app.main)


def test_cors_wildcard_disables_credentials(reload_main):
    """当 cors_origins 包含 '*' 时，allow_credentials 应为 False。"""
    main = reload_main("*")
    assert "*" in main._origins
    assert main.allow_credentials is False


def test_cors_specific_origins_enables_credentials(reload_main):
    """当 cors_origins 为正常 URL 时，allow_credentials 应为 True。"""
    main = reload_main("http://localhost:5173")
    assert "*" not in main._origins
    assert main.allow_credentials is True


def test_cors_mixed_with_wildcard_disables_credentials(reload_main):
    """当 cors_origins 同时包含 '*' 和具体 URL 时，仍应禁用 credentials。"""
    main = reload_main("*,http://localhost:5173")
    assert "*" in main._origins
    assert main.allow_credentials is False
