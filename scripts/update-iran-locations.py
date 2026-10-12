"""Fetch data only from a reviewed, pinned public source; never execute its code."""
import argparse
import hashlib
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

REPO = "tafakoritech/Provinces-and-Cities-of-Iran-Dataset"
DEFAULT_COMMIT = "e00e125d10259f6f3a5e4802cd336cef89258222"
ROOT = Path(__file__).resolve().parent.parent


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Morphiume-location-data-update"})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(5_000_001)
    if len(data) > 5_000_000:
        raise ValueError("Source exceeds the data size limit")
    return data


def name(value):
    if not isinstance(value, str):
        raise ValueError("Location name must be text")
    normalized = " ".join(unicodedata.normalize("NFC", value).replace("ي", "ی").replace("ك", "ک").split())
    if not normalized or len(normalized) > 80 or re.search(r"[<>\x00-\x1f]", normalized):
        raise ValueError("Invalid location name")
    return normalized


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--commit", default=DEFAULT_COMMIT, help="Reviewed 40-character source commit")
args = parser.parse_args()
if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
    raise ValueError("A full reviewed commit SHA is required")
base = f"https://raw.githubusercontent.com/{REPO}/{args.commit}/"
raw = download(base + "cities.json")
province_raw = download(base + "provinces.json")
license_bytes = download(base + "LICENSE")
if not license_bytes.decode("utf-8").startswith("MIT License"):
    raise ValueError("Source license changed; review required")
rows = json.loads(raw)
province_rows = json.loads(province_raw)
if not isinstance(rows, list) or len(rows) > 20_000 or not isinstance(province_rows, list):
    raise ValueError("Unexpected location data structure")
ids = set()
for kind, source_rows in [("province", province_rows), ("city", rows)]:
    for row in source_rows:
        if not isinstance(row, dict) or type(row.get("id")) is not int or row["id"] <= 0 or (kind, row["id"]) in ids:
            raise ValueError("Invalid or duplicate source identifier")
        ids.add((kind, row["id"]))
provinces = {row["id"]: {"id": row["id"], "name": name(row["name"]), "cities": []} for row in province_rows}
if len(provinces) != 31:
    raise ValueError("Province count changed; explicit source review required")
for row in rows:
    province = provinces.get(row.get("province_id"))
    if not province:
        raise ValueError("City references an unknown province")
    province["cities"].append({"id": row["id"], "name": name(row["name"])})
for province in provinces.values():
    if not province["cities"]:
        raise ValueError("Province has no listed cities")
    province["cities"].sort(key=lambda city: (city["name"], city["id"]))
result = sorted(provinces.values(), key=lambda province: province["name"])
folder = ROOT / "src/lib"
folder.mkdir(parents=True, exist_ok=True)
serialized = (json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
manifest = {
    "repository": f"https://github.com/{REPO}", "commit": args.commit,
    "sourceFile": "cities.json", "sourceSha256": hashlib.sha256(raw).hexdigest(),
    "provinceSourceFile": "provinces.json", "provinceSourceSha256": hashlib.sha256(province_raw).hexdigest(),
    "license": "MIT", "licenseSha256": hashlib.sha256(license_bytes).hexdigest(),
    "outputSha256": hashlib.sha256(serialized).hexdigest(), "provinceCount": len(result),
    "cityCount": sum(len(province["cities"]) for province in result),
    "normalization": "NFC, Persian yeh/kaf, collapsed whitespace; explicit city/province records linked by province_id",
    "authority": "Community snapshot. Current official administrative divisions and carrier coverage are not independently verified.",
}
(folder / "iran-locations.json").write_bytes(serialized)
(folder / "iran-locations.LICENSE.txt").write_bytes(license_bytes)
(ROOT / "docs/LOCATIONS_SOURCE.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Pinned source imported: {len(result)} provinces, {manifest['cityCount']} cities; source {args.commit}; hashes recorded.")
