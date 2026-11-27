"""Load content files: a small front-matter header plus a Markdown body.

Front matter is a deliberately tiny YAML subset so non-developers can edit it:

    ---
    title: Cantilever scaffold
    tags: [restricted access, no ground bearing]
    review_months: 12
    ---
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

# Folder name -> content type. Folder order is also the display order.
TYPES = {"systems": "system", "guidance": "guidance", "projects": "project"}


class ContentError(Exception):
    """A content file cannot be read at all (as opposed to a validation issue)."""


@dataclass
class Item:
    type: str
    id: str
    path: str  # repo-relative, forward slashes (used for "edit this page" links)
    meta: dict
    body: str
    refs: set = field(default_factory=set)  # filled in by build/validate

    @property
    def title(self) -> str:
        return str(self.meta.get("title", self.id))


def parse_value(raw: str):
    v = raw.strip()
    if v.startswith("[") and v.endswith("]"):
        inner = v[1:-1].strip()
        return [x.strip().strip("\"'") for x in inner.split(",") if x.strip()] if inner else []
    if v in ("true", "false"):
        return v == "true"
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    if re.fullmatch(r"-?\d+\.\d+", v):
        return float(v)
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def parse_file(text: str, source: str) -> tuple[dict, str]:
    text = text.replace("\r\n", "\n").lstrip("﻿")
    if not text.startswith("---\n"):
        raise ContentError(f"{source}: file must start with a '---' front-matter block")
    end = text.find("\n---", 3)
    if end == -1:
        raise ContentError(f"{source}: front-matter block is never closed with '---'")
    meta: dict = {}
    for lineno, line in enumerate(text[4:end].split("\n"), start=2):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, sep, value = line.partition(":")
        if not sep or not key.strip():
            raise ContentError(f"{source}:{lineno}: expected 'key: value', got {line!r}")
        meta[key.strip()] = parse_value(value)
    body = text[end + 4 :].lstrip("\n")
    return meta, body


def load(root: Path) -> list[Item]:
    root = Path(root)
    items: list[Item] = []
    for folder, kind in TYPES.items():
        for path in sorted((root / "content" / folder).glob("*.md")):
            meta, body = parse_file(path.read_text(encoding="utf-8"), str(path))
            rel = path.relative_to(root).as_posix()
            items.append(Item(type=kind, id=path.stem, path=rel, meta=meta, body=body))
    return items


def load_advisor(root: Path) -> dict | None:
    """The Scaffold Advisor's factors and questions (content/advisor.json), if present."""
    path = Path(root) / "content" / "advisor.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ContentError(f"{path}: not valid JSON - line {e.lineno}, column {e.colno}: {e.msg}") from e


def load_help(root: Path):
    """The 'How to use' guide (content/help.md) -> (meta, body, repo-relative path), if present."""
    path = Path(root) / "content" / "help.md"
    if not path.exists():
        return None
    meta, body = parse_file(path.read_text(encoding="utf-8"), str(path))
    return meta, body, path.relative_to(root).as_posix()
