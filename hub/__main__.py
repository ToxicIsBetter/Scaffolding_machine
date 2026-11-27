"""Command line:  python -m hub <command>

  validate [--strict]     check every content file (CI runs this on each change)
  build [--out dist]      validate, then build the website into dist/index.html
  stale [--markdown]      list pages overdue for review (used by the weekly reminder)
  new <type> <id>         start a new page from a template, e.g.  new project riverside-tower
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
from pathlib import Path

from . import build as build_mod
from .content import TYPES, ContentError, load, load_advisor, load_help
from .validate import Issue, overdue, validate, validate_advisor

ROOT = Path(__file__).resolve().parent.parent

TEMPLATES = {
    "project": """---
title: {title}
summary: One sentence - what we scaffolded, where, and why.
status: Tendering
client: Client name
location: Street, Borough
start: {today}
systems: [tube-and-fitting]
guidance: []
tags: []
owner: Contracts Manager
last_reviewed: {today}
review_months: 6
---

## Scope

What the client needed access or protection for.

## Scaffold solution

Which systems, heights, lifts, load classes, ties - link systems like [[tube-and-fitting]].

## Key documents

- Design / drawing reference:
- Handover certificate:
- Highway licence:

## Lessons learned

What we would repeat, and what we would do differently.
""",
    "system": """---
title: {title}
summary: One sentence describing the system.
category: Access scaffold
design_basis: TG20 compliance possible
typical_uses: [Use one]
tags: []
guidance: [work-at-height-regs]
role: structure
requires: []
suits: [facade]
avoid: []
owner: Design Office
last_reviewed: {today}
review_months: 12
---

## When to use it

## Key requirements

## Common pitfalls
""",
    "guidance": """---
title: {title}
summary: One sentence describing the document.
kind: Company procedure
reference: Document code / edition
tags: []
owner: SHEQ Manager
last_reviewed: {today}
review_months: 12
---

## What it covers

## What it means on site
""",
}


def _load_or_exit():
    try:
        return load(ROOT)
    except ContentError as e:
        _report("error", str(e), "")
        sys.exit(1)


def _report(level: str, message: str, path: str) -> None:
    if os.environ.get("GITHUB_ACTIONS"):
        # renders as an inline annotation on the pull request's changed file
        print(f"::{level} file={path}::{message}")
    else:
        print(f"{level.upper():7} {path}: {message}" if path else f"{level.upper():7} {message}")


def cmd_validate(args) -> int:
    items = _load_or_exit()
    try:
        advisor = load_advisor(ROOT)
    except ContentError as e:
        _report("error", str(e), "content/advisor.json")
        return 1
    issues = validate(items) + validate_advisor(advisor, items)
    help_ = load_help(ROOT)
    if help_:
        from .md import wiki_ids
        known = {it.id for it in items}
        issues += [Issue("error", help_[2], f"broken link [[{r}]]") for r in wiki_ids(help_[1]) if r not in known]
    for i in issues:
        _report(i.level, i.message, i.path)
    errors = sum(i.level == "error" for i in issues)
    warnings = len(issues) - errors
    counts = ", ".join(f"{sum(it.type == t for it in items)} {t}" for t in TYPES.values())
    print(f"\nChecked {len(items)} pages ({counts}): {errors} error(s), {warnings} warning(s).")
    return 1 if errors or (args.strict and warnings) else 0


def cmd_build(args) -> int:
    if cmd_validate(argparse.Namespace(strict=False)):
        print("Build stopped: fix the errors above first.")
        return 1
    target = build_mod.build(ROOT, load(ROOT), ROOT / args.out)
    print(f"Built {target.relative_to(ROOT)}  ({target.stat().st_size // 1024} KB) - open it in a browser.")
    return 0


def cmd_stale(args) -> int:
    rows = overdue(_load_or_exit())
    if args.markdown:
        if not rows:
            print("Every page is within its review date. Nothing to do.")
            return 0
        print("These pages are past their review date. Owners: please check them, update anything that has changed, "
              "and bump `last_reviewed` (even if nothing changed).\n")
        print("| Page | Owner | Review was due |\n|---|---|---|")
        for it, due in rows:
            print(f"| [{it.title}]({it.path}) | {it.meta.get('owner', '?')} | {due} |")
    else:
        for it, due in rows:
            print(f"{due}  {it.meta.get('owner', '?'):22} {it.path}")
        print(f"{len(rows)} page(s) overdue for review.")
    return 0


def cmd_new(args) -> int:
    folder = {v: k for k, v in TYPES.items()}[args.type]
    path = ROOT / "content" / folder / f"{args.id}.md"
    if path.exists():
        print(f"{path.relative_to(ROOT)} already exists.")
        return 1
    title = args.id.replace("-", " ").capitalize()
    path.write_text(TEMPLATES[args.type].format(title=title, today=dt.date.today().isoformat()), encoding="utf-8")
    print(f"Created {path.relative_to(ROOT)} - fill it in, then run: python -m hub build")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m hub", description="Scaffold Knowledge Hub")
    sub = p.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validate", help="check all content")
    v.add_argument("--strict", action="store_true", help="treat warnings as errors")
    b = sub.add_parser("build", help="build the website")
    b.add_argument("--out", default="dist")
    s = sub.add_parser("stale", help="list pages overdue for review")
    s.add_argument("--markdown", action="store_true")
    n = sub.add_parser("new", help="create a new page from a template")
    n.add_argument("type", choices=list(TYPES.values()))
    n.add_argument("id", help="lower-case-with-hyphens")
    args = p.parse_args(argv)
    return {"validate": cmd_validate, "build": cmd_build, "stale": cmd_stale, "new": cmd_new}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
