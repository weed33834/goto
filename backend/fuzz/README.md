# Goto Backend Fuzz 测试

本目录包含面向 OpenSSF Scorecard Fuzzing 检查可识别的 fuzz 测试。

## 目录结构

```
backend/fuzz/
├── __init__.py
├── test_validator_fuzz.py   # 以 *_fuzz.py 结尾，便于 Scorecard 识别
└── README.md
```

## 检测模式

OpenSSF Scorecard 的 Fuzzing check 会识别以下信号：

- 存在 `fuzz/` 目录；
- 文件名匹配 `*_fuzz.py` / `Fuzz*.py` 等模式；
- 使用 ClusterFuzzLite、OSS-Fuzz、AFL、LibFuzzer 等原生 fuzz 框架。

Goto 当前使用 [Hypothesis](https://hypothesis.readthedocs.io/) 进行基于属性的 fuzz 测试，
通过将测试文件命名为 `test_validator_fuzz.py` 并放置于 `backend/fuzz/`，
使其同时满足 Scorecard 的文件模式识别与 pytest 的默认用例发现规则。

## 测试目标

`test_validator_fuzz.py` 重点 fuzz 以下安全敏感校验器：

- `validate_file_path`：防止路径穿越与越界访问；
- `validate_git_url`：确保只允许安全的 Git URL 协议前缀；
- `validate_category`：确保分类字段不含目录分隔符或路径穿越字符。

## 运行方式

在项目根目录执行：

```bash
cd backend
PYTHONPATH=. pytest -q fuzz/
```

CI 的 `Backend Tests & Fuzz` job 已通过 `PYTHONPATH=. pytest -q` 自动发现并执行本目录下的 fuzz 测试。
