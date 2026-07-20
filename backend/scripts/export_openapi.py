#!/usr/bin/env python3
"""导出 OpenAPI 规范到 backend/docs/openapi.json。

用法：python scripts/export_openapi.py
产物：backend/docs/openapi.json（美化输出，UTF-8）
"""
import json
import sys
from pathlib import Path

# 确保 app 可导入
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402


def main() -> None:
    spec = app.openapi()
    out_dir = Path(__file__).resolve().parent.parent / "docs"
    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / "openapi.json"
    payload = json.dumps(spec, indent=2, ensure_ascii=False)
    out_file.write_text(payload, encoding="utf-8")
    print(f"OpenAPI spec exported to {out_file} ({out_file.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
