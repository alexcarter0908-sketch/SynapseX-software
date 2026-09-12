from __future__ import annotations

import resource
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
started = time.perf_counter()
completed = subprocess.run(
    [sys.executable, "-m", "uea", "baseline", "workspace/fixture", "--skip-tests", "--no-write"],
    cwd=root,
    capture_output=True,
    text=True,
    check=False,
)
elapsed = time.perf_counter() - started
rss_kb = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
print(f"exit_code={completed.returncode}")
print(f"elapsed_seconds={elapsed:.3f}")
print(f"child_max_rss_kb={rss_kb}")
print(f"stdout_lines={len(completed.stdout.splitlines())}")
if completed.stderr:
    print("stderr=" + completed.stderr.strip().replace("\n", " | "))
