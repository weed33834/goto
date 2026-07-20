# Fuzzing

TaskFlow uses property-based fuzz testing with [Hypothesis](https://hypothesis.readthedocs.io/) to validate security-critical code paths, including path traversal prevention and URL validation.

## What we fuzz

- **Path validators** — `validate_file_path`, `validate_category` ensure no path traversal escapes the base directory.
- **URL validators** — `validate_git_url` ensures only valid git URLs are accepted.
- **Input sanitizers** — all user-controlled inputs are tested with arbitrary byte sequences.

## Running fuzz tests locally

```bash
cd backend
pip install -r requirements-build.txt -r requirements.txt
PYTHONPATH=. pytest fuzz/ -v
```

## CI integration

Fuzz tests run on every push and PR via the [Fuzz workflow](/.github/workflows/fuzz.yml) and weekly on schedule.

## Adding new fuzz targets

1. Create a test file under `backend/fuzz/` following the existing pattern.
2. Use `hypothesis.given` with appropriate strategies.
3. Add `@settings(max_examples=500, deadline=None)` for thorough coverage.
4. Ensure the test is imported/collected by pytest's `fuzz/` discovery.
