"""Bounded runtime-only host/DB sampling, with no request/customer identifiers."""
import argparse
import json
import re
import subprocess
import time
from pathlib import Path

import contract as c
import health


def main(args):
    c.assert_boundaries()
    output = c.exact_path(args.output)
    if output.parent != c.ROOT / 'metrics' or not re.fullmatch(r'runtime-[0-9]{8}T[0-9]{6}Z\.jsonl', output.name):
        raise ValueError('Use an exact runtime/metrics timestamped JSONL filename')
    if not 1 <= args.duration <= 3600 or not 5 <= args.interval <= 60:
        raise ValueError('Use duration1-3600s and interval5-60s')
    c.write_private(output, '')
    deadline = time.monotonic() + args.duration
    with output.open('a', encoding='utf-8') as log:
        while time.monotonic() < deadline:
            started = time.monotonic()
            sample = health.snapshot(args.mode)
            log.write(json.dumps(sample) + '\n'); log.flush()
            time.sleep(min(max(0, args.interval - (time.monotonic() - started)), max(0, deadline - time.monotonic())))
    return {'scope': c.PROJECT, 'metricsFile': str(output), 'notificationDelivery': 'local-only-not-configured'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--duration', type=int, default=2700)
    parser.add_argument('--interval', type=int, default=15)
    parser.add_argument('--mode', choices=('prepared', 'running', 'maintenance'), required=True)
    args = parser.parse_args()
    try: print(json.dumps(main(args)))
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        print('Runtime metrics sampling stopped; existing evidence is retained.')
        raise SystemExit(1) from None
