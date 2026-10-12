"""Download the pinned official Windows Gitleaks archive and verify its release digest."""
from pathlib import Path
import hashlib
import urllib.request
import zipfile
import io

root = Path(__file__).resolve().parents[1]
destination = root / ".local" / "scanners"
url = "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_windows_x64.zip"
expected = "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e"
with urllib.request.urlopen(url, timeout=60) as response:
    archive = response.read(64 * 1024 * 1024)
if hashlib.sha256(archive).hexdigest() != expected:
    raise RuntimeError("Official release checksum mismatch")
destination.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
    binary = bundle.read("gitleaks.exe")
(destination / "gitleaks.exe").write_bytes(binary)
print("Pinned Gitleaks 8.30.1 archive verified; executable stored in ignored local folder.")
