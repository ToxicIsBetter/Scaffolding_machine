"""Content rules. CI runs these on every change so the hub can't silently rot.

Errors block a merge. Warnings (e.g. a page overdue for review) are reported
and, on a schedule, turned into a GitHub issue for the page owner.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass

from . import md
from .content import Item

COMMON_REQUIRED = {"title": str, "summary": str, "owner": str, "last_reviewed": "date", "review_months": int}

SCHEMA = {
    "system": {
        "required": {"category": str, "design_basis": str, "typical_uses": list, "tags": list, "guidance": list,
                     "role": str, "suits": list},
        "enums": {
            "category": {"Access scaffold", "System scaffold", "Special scaffold", "Weather protection", "Component", "Mobile access"},
            "design_basis": {"TG20 compliance possible", "Bespoke design required", "Manufacturer's guidance"},
            "role": {"structure", "addon"},
        },
        "refs": {"guidance": "guidance", "related": "system"},
    },
    "guidance": {
        "required": {"kind": str, "reference": str, "tags": list},
        "enums": {"kind": {"Legislation", "Industry guidance", "British / European Standard", "Company procedure", "Checklist"}},
        "refs": {"related": "guidance"},
    },
    "project": {
        "required": {"status": str, "location": str, "client": str, "start": "date", "systems": list, "tags": list},
        "enums": {"status": {"Tendering", "Live", "Completed"}},
        "refs": {"systems": "system", "guidance": "guidance"},
    },
}


@dataclass
class Issue:
    level: str  # "error" | "warning"
    path: str
    message: str

    def __str__(self):
        return f"{self.level.upper():7} {self.path}: {self.message}"


def to_date(value) -> dt.date | None:
    if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        try:
            return dt.date.fromisoformat(value)
        except ValueError:
            return None
    return None


def add_months(d: dt.date, months: int) -> dt.date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    for day in (d.day, 30, 29, 28):  # clamp e.g. 31 Jan + 1 month
        try:
            return dt.date(year, month, day)
        except ValueError:
            continue
    raise ValueError(d)


def review_due(item: Item) -> dt.date | None:
    last = to_date(item.meta.get("last_reviewed"))
    months = item.meta.get("review_months")
    if last and isinstance(months, int) and months > 0:
        return add_months(last, months)
    return None


def _check_type(value, expected) -> bool:
    if expected == "date":
        return to_date(value) is not None
    if expected is list:
        return isinstance(value, list) and len(value) > 0
    if expected is str:
        return isinstance(value, str) and value.strip() != ""
    return isinstance(value, expected) and not isinstance(value, bool)


def validate(items: list[Item], today: dt.date | None = None) -> list[Issue]:
    today = today or dt.date.today()
    issues: list[Issue] = []
    by_id: dict[str, Item] = {}

    for it in items:
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", it.id):
            issues.append(Issue("error", it.path, "file name must be lower-case-with-hyphens.md"))
        if it.id in by_id:
            issues.append(Issue("error", it.path, f"duplicate id '{it.id}' (also {by_id[it.id].path})"))
        by_id[it.id] = it

    for it in items:
        schema = SCHEMA[it.type]
        required = {**COMMON_REQUIRED, **schema["required"]}
        for key, expected in required.items():
            if key not in it.meta:
                issues.append(Issue("error", it.path, f"missing required field '{key}'"))
            elif not _check_type(it.meta[key], expected):
                want = "a date like 2026-03-31" if expected == "date" else (
                    "a non-empty [list, of, values]" if expected is list else getattr(expected, "__name__", expected))
                issues.append(Issue("error", it.path, f"'{key}' should be {want}, got {it.meta[key]!r}"))

        for key, allowed in schema["enums"].items():
            v = it.meta.get(key)
            if v is not None and v not in allowed:
                issues.append(Issue("error", it.path, f"'{key}' must be one of: {', '.join(sorted(allowed))} (got {v!r})"))

        # references in front matter
        for key, target_type in schema["refs"].items():
            for ref in it.meta.get(key, []) or []:
                tgt = by_id.get(ref)
                if tgt is None:
                    issues.append(Issue("error", it.path, f"'{key}' refers to '{ref}', which doesn't exist"))
                elif tgt.type != target_type:
                    issues.append(Issue("error", it.path, f"'{key}' refers to '{ref}', which is a {tgt.type}, not a {target_type}"))

        # [[links]] in the body
        for ref in md.wiki_ids(it.body):
            if ref not in by_id:
                issues.append(Issue("error", it.path, f"broken link [[{ref}]]"))

        if not it.body.strip():
            issues.append(Issue("warning", it.path, "page has no body text"))

        last = to_date(it.meta.get("last_reviewed"))
        if last and last > today:
            issues.append(Issue("error", it.path, f"last_reviewed {last} is in the future"))
        due = review_due(it)
        if due and due < today:
            issues.append(Issue("warning", it.path, f"review overdue since {due} (owner: {it.meta.get('owner', '?')})"))

        if it.type == "project":
            start, end = to_date(it.meta.get("start")), to_date(it.meta.get("end"))
            if "end" in it.meta and end is None:
                issues.append(Issue("error", it.path, "'end' should be a date like 2026-03-31"))
            if start and end and end < start:
                issues.append(Issue("error", it.path, "'end' is before 'start'"))
            if it.meta.get("status") == "Completed" and not end:
                issues.append(Issue("warning", it.path, "completed project has no 'end' date"))

    return issues


def overdue(items: list[Item], today: dt.date | None = None) -> list[tuple[Item, dt.date]]:
    today = today or dt.date.today()
    rows = [(it, review_due(it)) for it in items]
    return sorted([(it, d) for it, d in rows if d and d < today], key=lambda r: r[1])


ADVISOR_PATH = "content/advisor.json"


def validate_advisor(advisor: dict | None, items: list[Item]) -> list[Issue]:
    """Check the Scaffold Advisor's rules: every factor a system or question mentions must exist."""
    if advisor is None:
        return []
    issues: list[Issue] = []
    factors = advisor.get("factors", [])
    ids = [f.get("id") for f in factors]
    known = set(ids)
    for f in factors:
        for key in ("id", "label", "reason", "keywords"):
            if key not in f:
                issues.append(Issue("error", ADVISOR_PATH, f"factor {f.get('id', '?')!r} is missing '{key}'"))
        if not isinstance(f.get("weight", 1), (int, float)):
            issues.append(Issue("error", ADVISOR_PATH, f"factor {f.get('id')!r}: weight must be a number"))
    for dup in {i for i in ids if ids.count(i) > 1}:
        issues.append(Issue("error", ADVISOR_PATH, f"factor id {dup!r} is defined twice"))

    for g in advisor.get("groups", []):
        for key in ("options", "ask_if", "ask_unless"):
            for fid in g.get(key, []):
                if fid not in known:
                    issues.append(Issue("error", ADVISOR_PATH, f"question {g.get('id')!r} uses unknown factor {fid!r}"))
        for fid in g.get("labels", {}):
            if fid not in g.get("options", []):
                issues.append(Issue("error", ADVISOR_PATH, f"question {g.get('id')!r} labels {fid!r}, which isn't one of its options"))
        if g.get("ask") and not g.get("question"):
            issues.append(Issue("error", ADVISOR_PATH, f"question {g.get('id')!r} has ask: true but no question text"))

    structures = 0
    for it in items:
        if it.type != "system":
            continue
        structures += it.meta.get("role") == "structure"
        for key in ("requires", "suits", "avoid"):
            for fid in it.meta.get(key, []) or []:
                if fid not in known:
                    issues.append(Issue("error", it.path, f"'{key}' uses unknown advisor factor {fid!r} (see {ADVISOR_PATH})"))
        clash = set(it.meta.get("suits", []) or []) & set(it.meta.get("avoid", []) or [])
        if clash:
            issues.append(Issue("error", it.path, f"factor(s) in both 'suits' and 'avoid': {', '.join(sorted(clash))}"))
    if structures == 0:
        issues.append(Issue("error", ADVISOR_PATH, "no system has role: structure, so the advisor can't recommend anything"))
    return issues
