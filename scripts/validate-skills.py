from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[1]
expected = {
    "morphiume-brand-ux", "morphiume-fa-rtl", "morphiume-storefront",
    "morphiume-admin", "morphiume-commerce", "morphiume-iran-payments",
    "morphiume-auth-security", "morphiume-ops", "morphiume-qa",
    "morphiume-seo-performance",
}
errors = []
for name in sorted(expected):
    path = root / ".agents" / "skills" / name / "SKILL.md"
    if not path.is_file():
        errors.append(f"{name}: missing SKILL.md")
        continue
    text = path.read_text(encoding="utf-8-sig")
    parts = text.split("---", 2)
    if len(parts) != 3 or parts[0].strip():
        errors.append(f"{name}: missing frontmatter")
        continue
    if not re.search(rf"(?m)^name:\s*{re.escape(name)}\s*$", parts[1]):
        errors.append(f"{name}: name mismatch")
    if not re.search(r"(?m)^description:\s*\S", parts[1]) or len(parts[2].strip()) < 200:
        errors.append(f"{name}: missing description/workflow")
    if re.search(r"\bTODO\b|\[INSERT", text):
        errors.append(f"{name}: unfinished scaffold")
if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"Validated {len(expected)} repository skill entrypoints.")
