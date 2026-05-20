#!/usr/bin/env python3
"""Import Whitelist Data.xlsb → phone list + phone→OLM ID map (Store ID)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import pyxlsb
except ImportError:
    print("Install: pip3 install pyxlsb", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSB = Path.home() / "Downloads" / "Whitelist Data.xlsb"
OUT_LIST = ROOT / "data" / "phone-whitelist.json"
OUT_MAP = ROOT / "data" / "phone-whitelist-map.json"


def parse_phone(raw) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, float) and raw == int(raw):
        sraw = str(int(raw))
    else:
        sraw = str(raw).strip()
    sraw = re.sub(r"\D", "", sraw)
    if sraw.startswith("91") and len(sraw) == 12:
        sraw = sraw[2:]
    if len(sraw) >= 10:
        return sraw[-10:]
    return None


def cell_str(val) -> str:
    if val is None:
        return ""
    if isinstance(val, float) and val == int(val):
        return str(int(val))
    return str(val).strip()


def import_xlsb(xlsb_path: Path) -> tuple[list[str], dict[str, dict]]:
    phone_map: dict[str, dict] = {}
    with pyxlsb.open_workbook(str(xlsb_path)) as wb:
        with wb.get_sheet(1) as sheet:
            msisdn_col = olm_col = circle_col = name_col = 0
            for i, row in enumerate(sheet.rows()):
                vals = [c.v for c in row]
                if i == 2 and vals and "MSISDN" in vals:
                    msisdn_col = vals.index("MSISDN")
                    olm_col = vals.index("OLM ID") if "OLM ID" in vals else 2
                    circle_col = vals.index("Circle") if "Circle" in vals else 1
                    name_col = vals.index("Name") if "Name" in vals else 3
                    continue
                if i < 3 or not vals:
                    continue
                phone = parse_phone(vals[msisdn_col] if msisdn_col < len(vals) else None)
                if not phone:
                    continue
                olm_id = cell_str(vals[olm_col] if olm_col < len(vals) else None)
                phone_map[phone] = {
                    "olmId": olm_id,
                    "storeId": olm_id,
                    "circle": cell_str(vals[circle_col] if circle_col < len(vals) else None),
                    "name": cell_str(vals[name_col] if name_col < len(vals) else None),
                }
    phones = sorted(phone_map.keys())
    return phones, phone_map


def write_outputs(phones: list[str], phone_map: dict[str, dict]) -> None:
    OUT_LIST.parent.mkdir(parents=True, exist_ok=True)
    list_json = json.dumps(phones, separators=(",", ":"))
    map_json = json.dumps(phone_map, separators=(",", ":"))
    OUT_LIST.write_text(list_json, encoding="utf-8")
    OUT_MAP.write_text(map_json, encoding="utf-8")
    for dest in (
        ROOT / "server" / "data" / "phone-whitelist.json",
        ROOT / "server" / "data" / "phone-whitelist-map.json",
    ):
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.name.endswith("-map.json"):
            dest.write_text(map_json, encoding="utf-8")
        else:
            dest.write_text(list_json, encoding="utf-8")
    print(f"Wrote {len(phones)} phones → {OUT_LIST}")
    print(f"Wrote OLM map → {OUT_MAP} ({OUT_MAP.stat().st_size} bytes)")


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSB
    if not src.is_file():
        print(f"File not found: {src}", file=sys.stderr)
        sys.exit(1)
    phones, phone_map = import_xlsb(src)
    write_outputs(phones, phone_map)


if __name__ == "__main__":
    main()
