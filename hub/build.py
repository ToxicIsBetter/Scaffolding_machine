"""Build the site: one self-contained index.html (works offline, from a USB stick, or on GitHub Pages)."""

from __future__ import annotations

import datetime as dt
import html
import json
from pathlib import Path

from . import md
from .content import TYPES, Item, load_advisor, load_help
from .validate import SCHEMA, review_due

LABELS = {"system": "Scaffold systems", "guidance": "Standards & procedures", "project": "Projects"}


def route(item: Item) -> str:
    return f"#/{item.type}/{item.id}"


def compute_refs(items: list[Item]) -> None:
    for it in items:
        refs = set(md.wiki_ids(it.body))
        for key in list(SCHEMA[it.type]["refs"]) + ["related"]:
            refs.update(it.meta.get(key, []) or [])
        it.refs = refs - {it.id}


def build_data(items: list[Item], config: dict, advisor: dict | None = None) -> dict:
    by_id = {it.id: it for it in items}
    compute_refs(items)
    resolve = lambda i: (route(by_id[i]), by_id[i].title) if i in by_id else None

    backlinks: dict[str, set] = {it.id: set() for it in items}
    for it in items:
        for ref in it.refs:
            if ref in backlinks:
                backlinks[ref].add(it.id)

    repo = config.get("repo", "").rstrip("/")
    branch = config.get("branch", "main")
    out = []
    for it in items:
        due = review_due(it)
        out.append({
            "id": it.id,
            "type": it.type,
            "title": it.title,
            "summary": it.meta.get("summary", ""),
            "meta": it.meta,
            "html": md.render(it.body, resolve),
            "text": md.plain(it.body, lambda i: by_id[i].title if i in by_id else i),
            "related": sorted(r for r in it.refs | backlinks[it.id] if r in by_id),
            "review_due": due.isoformat() if due else None,
            "path": it.path,
            "edit_url": f"{repo}/edit/{branch}/{it.path}" if repo else None,
        })
    return {
        "config": config,
        "labels": LABELS,
        "types": list(TYPES.values()),
        "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "items": out,
        "advisor": advisor,
        "help": help_page(by_id, resolve, repo, branch),
    }


HELP_ROOT: Path | None = None


def help_page(by_id, resolve, repo, branch) -> dict | None:
    loaded = load_help(HELP_ROOT) if HELP_ROOT else None
    if not loaded:
        return None
    meta, body, rel = loaded
    return {
        "title": meta.get("title", "How to use"),
        "summary": meta.get("summary", ""),
        "html": md.render(body, resolve),
        "edit_url": f"{repo}/edit/{branch}/{rel}" if repo else None,
    }


def build(root: Path, items: list[Item], out_dir: Path) -> Path:
    global HELP_ROOT
    HELP_ROOT = Path(root)
    root = Path(root)
    config = json.loads((root / "hub.json").read_text(encoding="utf-8"))
    data = build_data(items, config, load_advisor(root))
    tpl = root / "templates"
    page = (tpl / "index.html").read_text(encoding="utf-8")
    # "</" must not appear inside an inline <script>, or the browser ends the tag early.
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    replacements = {
        "{{TITLE}}": html.escape(config.get("name", "Knowledge Hub")),
        "{{STYLE}}": (tpl / "style.css").read_text(encoding="utf-8"),
        "{{SCRIPT}}": (tpl / "advisor.js").read_text(encoding="utf-8") + "\n" + (tpl / "app.js").read_text(encoding="utf-8"),
        "{{DATA}}": payload,
    }
    for key, value in replacements.items():
        page = page.replace(key, value)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / "index.html"
    target.write_text(page, encoding="utf-8")
    (out_dir / ".nojekyll").write_text("", encoding="utf-8")
    # Machine-readable copy, used by the advisor tests (and handy for future integrations).
    (out_dir / "hub-data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return target
