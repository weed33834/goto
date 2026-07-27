"""app/config.py 单元测试

测试 Settings 默认值、环境变量覆盖、类型解析与非法输入处理。

注意：这里始终通过 `Settings(_env_file=None)` 构造新实例，
避免读取项目根目录的 .env 文件，并通过 monkeypatch 隔离环境变量，
不污染全局单例 `settings`。
"""
import pytest
from pydantic import ValidationError

from app.config import Settings

# 可能影响 Settings 的环境变量名，逐用例清除以保证默认值断言稳定
_RELEVANT_ENV = [
    "APP_NAME", "APP_VERSION", "DEBUG", "API_HOST", "API_PORT",
    "CORS_ORIGINS", "ENABLE_DOCS", "API_TOKEN", "API_TOKEN_FILE",
    "DATABASE_URL",
]


def _clear_env(monkeypatch):
    """清除所有相关环境变量，确保 Settings 回到默认值。"""
    for var in _RELEVANT_ENV:
        monkeypatch.delenv(var, raising=False)


def test_default_settings_values(monkeypatch):
    """无环境变量时应返回全部默认值。"""
    _clear_env(monkeypatch)
    s = Settings(_env_file=None)
    assert s.app_name == "Goto Backend"
    assert s.app_version == "0.1.0"
    assert s.debug is False
    assert s.api_host == "127.0.0.1"
    assert s.api_port == 8000
    assert s.cors_origins == "http://localhost:5173,http://localhost:8081"
    assert s.enable_docs is False
    assert s.api_token is None
    assert s.api_token_file is None


def test_database_url_default_points_to_data_dir(monkeypatch):
    """默认 database_url 应指向 backend/data/goto.db。"""
    _clear_env(monkeypatch)
    s = Settings(_env_file=None)
    assert s.database_url.startswith("sqlite+aiosqlite:///")
    assert s.database_url.endswith("data/goto.db")


def test_env_var_overrides_app_name(monkeypatch):
    """APP_NAME 环境变量应覆盖默认 app_name。"""
    monkeypatch.setenv("APP_NAME", "Custom Backend")
    s = Settings(_env_file=None)
    assert s.app_name == "Custom Backend"


def test_env_var_overrides_debug_with_bool_parsing(monkeypatch):
    """DEBUG 环境变量应以字符串 "true"/"false" 解析为布尔值。"""
    monkeypatch.setenv("DEBUG", "true")
    assert Settings(_env_file=None).debug is True

    monkeypatch.setenv("DEBUG", "false")
    assert Settings(_env_file=None).debug is False


def test_env_var_overrides_api_port_with_int_parsing(monkeypatch):
    """API_PORT 环境变量应解析为整数。"""
    monkeypatch.setenv("API_PORT", "9999")
    s = Settings(_env_file=None)
    assert s.api_port == 9999
    assert isinstance(s.api_port, int)


def test_env_var_overrides_cors_origins(monkeypatch):
    """CORS_ORIGINS 环境变量应原样覆盖字符串字段。"""
    custom = "https://example.com,https://app.example.com"
    monkeypatch.setenv("CORS_ORIGINS", custom)
    assert Settings(_env_file=None).cors_origins == custom


def test_env_var_overrides_api_token(monkeypatch):
    """API_TOKEN 环境变量应注入到 settings.api_token。"""
    token = "x" * 64
    monkeypatch.setenv("API_TOKEN", token)
    s = Settings(_env_file=None)
    assert s.api_token == token


def test_invalid_bool_value_raises(monkeypatch):
    """DEBUG 设为非布尔字符串应抛出 ValidationError（边界/非法输入）。"""
    monkeypatch.setenv("DEBUG", "not-a-bool")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_invalid_port_value_raises(monkeypatch):
    """API_PORT 设为非数字字符串应抛出 ValidationError（边界/非法输入）。"""
    monkeypatch.setenv("API_PORT", "not-a-port")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_singleton_settings_is_instance():
    """全局单例 settings 应为 Settings 实例。"""
    from app.config import settings
    assert isinstance(settings, Settings)
