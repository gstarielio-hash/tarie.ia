$ErrorActionPreference = "Stop"

$env:RUN_E2E = "1"

python -m pytest tests/e2e -q `
  --browser chromium `
  --tracing retain-on-failure `
  --video retain-on-failure `
  --screenshot only-on-failure

