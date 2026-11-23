import json
from pathlib import Path
from typing import Any

CONFORMANCE_DIR = Path(__file__).resolve().parents[3] / "conformance"


def read_conformance_text(name: str) -> str:
    return (CONFORMANCE_DIR / name).read_text(encoding="utf-8").strip()


def read_conformance_json(name: str) -> Any:
    return json.loads(read_conformance_text(name))
