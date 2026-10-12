#!/usr/bin/env bash
set -euo pipefail
# Fail before staging writes if the audited reserved mount or staging paths have
# changed. This guard never writes to or enumerates the reserved database data.
[[ "$(findmnt --mountpoint /srv/morphiume/postgres --noheadings --output SOURCE)" == /dev/mapper/vg0-lv--2 ]] || { echo 'Reserved database mount source changed.' >&2; exit 1; }
[[ "$(findmnt --mountpoint /srv/morphiume/postgres --noheadings --output FSTYPE)" == ext4 ]] || { echo 'Reserved database filesystem changed.' >&2; exit 1; }
for directory in /etc/morphiume-staging /srv/morphiume/staging /srv/morphiume/staging/postgres /srv/morphiume/staging/media /srv/morphiume/staging/backups /srv/morphiume/staging/restore /srv/morphiume/staging/metrics /srv/morphiume/staging/releases /etc/morphiume-staging-runtime /srv/morphiume/staging/runtime /srv/morphiume/staging/runtime/media /srv/morphiume/staging/runtime/backups /srv/morphiume/staging/runtime/restore /srv/morphiume/staging/runtime/metrics /srv/morphiume/staging/runtime/releases; do
  [[ "$(realpath -m "$directory")" == "$directory" ]] || { echo 'Staging boundary resolves through an unexpected path.' >&2; exit 1; }
done
