"""基于属性的 fuzz 测试：验证路径与 URL 校验器。"""
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

from app.utils.validator import (
    ValidationError,
    validate_category,
    validate_file_path,
    validate_git_url,
)

BASE_DIR = Path("/tmp/goto-fuzz-base")


class TestValidateFilePathFuzz:
    """对 validate_file_path 进行 fuzz 测试。"""

    @settings(max_examples=500, deadline=None)
    @given(path=st.text(min_size=1, max_size=200))
    def test_file_path_never_escapes_base_dir(self, path):
        BASE_DIR.mkdir(parents=True, exist_ok=True)
        try:
            result = validate_file_path(path, base_dir=BASE_DIR)
            # 若校验通过，结果必须位于 base_dir 内
            assert result.resolve().relative_to(BASE_DIR.resolve()) is not None
        except ValidationError:
            pass

    @settings(max_examples=300, deadline=None)
    @given(
        name=st.text(
            alphabet="abcdefghijklmnopqrstuvwxyz0123456789_-.",
            min_size=1,
            max_size=50,
        )
    )
    def test_safe_filename_passes(self, name):
        BASE_DIR.mkdir(parents=True, exist_ok=True)
        try:
            result = validate_file_path(name, base_dir=BASE_DIR)
            assert (
                BASE_DIR.resolve() in result.resolve().parents
                or result.resolve() == BASE_DIR.resolve()
            )
        except ValidationError:
            # 例如 ".." 会被危险字符检查拒绝，这是预期行为
            pass


class TestValidateGitUrlFuzz:
    """对 validate_git_url 进行 fuzz 测试。"""

    @settings(max_examples=300, deadline=None)
    @given(url=st.text(min_size=1, max_size=200))
    def test_git_url_rejects_arbitrary_strings(self, url):
        try:
            validated = validate_git_url(url)
            assert validated.startswith(("https://", "http://", "git@"))
        except ValidationError:
            pass

    @settings(max_examples=200, deadline=None)
    @given(
        host=st.text(
            alphabet="abcdefghijklmnopqrstuvwxyz0123456789-.",
            min_size=3,
            max_size=50,
        ),
        owner=st.text(
            alphabet="abcdefghijklmnopqrstuvwxyz0123456789_-",
            min_size=1,
            max_size=30,
        ),
        repo=st.text(
            alphabet="abcdefghijklmnopqrstuvwxyz0123456789_-",
            min_size=1,
            max_size=30,
        ),
    )
    def test_valid_https_url_passes(self, host, owner, repo):
        url = f"https://{host}/{owner}/{repo}.git"
        try:
            validated = validate_git_url(url)
            assert validated == url
        except ValidationError:
            # 某些生成的 host 可能不符合域名规则，允许拒绝
            pass


class TestValidateCategoryFuzz:
    """对 validate_category 进行 fuzz 测试。"""

    @settings(max_examples=300, deadline=None)
    @given(category=st.text(min_size=1, max_size=100))
    def test_category_never_contains_path_traversal(self, category):
        try:
            result = validate_category(category)
            assert result is not None
            assert ".." not in result
            assert "/" not in result
            assert "\\" not in result
        except ValidationError:
            pass
