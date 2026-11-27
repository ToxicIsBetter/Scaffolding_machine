"""A small, safe Markdown renderer (headings, lists, tables, callouts, links).

All text is HTML-escaped first, so content files cannot inject scripts.
Internal links use wiki syntax: [[tg20]] or [[tg20|TG20 guidance]].
"""

from __future__ import annotations

import html
import re
from typing import Callable, Optional

WIKI = re.compile(r"\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]")
Resolver = Callable[[str], Optional[tuple]]  # id -> (href, title) or None


def wiki_ids(text: str) -> list[str]:
    return [m.group(1) for m in WIKI.finditer(text)]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def inline(text: str, resolve: Resolver) -> str:
    codes: list[str] = []

    def stash(m):
        codes.append(f"<code>{html.escape(m.group(1))}</code>")
        return f"\x00{len(codes) - 1}\x00"

    text = re.sub(r"`([^`]+)`", stash, text)
    text = html.escape(text, quote=True)

    def wiki(m):
        target = resolve(m.group(1))
        label = m.group(2)
        if not target:
            return f'<span class="broken-link">{label or m.group(1)}</span>'
        href, title = target
        return f'<a href="{href}">{label or html.escape(title)}</a>'

    text = WIKI.sub(wiki, text)

    def link(m):
        label, url = m.group(1), m.group(2)
        if not re.match(r"(https?:|mailto:|#)", html.unescape(url)):
            return label
        ext = ' target="_blank" rel="noopener"' if url.startswith("http") else ""
        return f'<a href="{url}"{ext}>{label}</a>'

    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", text)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], text)


def _table(rows: list[str], resolve: Resolver) -> str:
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    if len(cells) > 1 and all(re.fullmatch(r":?-{2,}:?", c) for c in cells[1]):
        head, body = cells[0], cells[2:]
    else:
        head, body = None, cells
    out = ['<div class="table-wrap"><table>']
    if head:
        out.append("<thead><tr>" + "".join(f"<th>{inline(c, resolve)}</th>" for c in head) + "</tr></thead>")
    out.append("<tbody>")
    for r in body:
        out.append("<tr>" + "".join(f"<td>{inline(c, resolve)}</td>" for c in r) + "</tr>")
    out.append("</tbody></table></div>")
    return "".join(out)


BLOCK_START = re.compile(r"(#{1,4}\s|\||>|[-*]\s|\d+\.\s)")


def render(text: str, resolve: Resolver = lambda _id: None) -> str:
    lines = text.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if not s:
            i += 1
            continue
        m = re.match(r"(#{1,4})\s+(.*)", s)
        if m:
            level = min(len(m.group(1)) + 1, 5)  # page title is the only <h1>
            out.append(f'<h{level} id="{slug(m.group(2))}">{inline(m.group(2), resolve)}</h{level}>')
            i += 1
            continue
        if s.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(lines[i])
                i += 1
            out.append(_table(rows, resolve))
            continue
        if s.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip()[1:].strip())
                i += 1
            first = buf[0].lower() if buf else ""
            kind = "warn" if first.startswith("**warning") or first.startswith("**important") else "note"
            out.append(f'<div class="callout {kind}">{render(chr(10).join(buf), resolve)}</div>')
            continue
        lm = re.match(r"([-*]|\d+\.)\s+", s)
        if lm:
            ordered = lm.group(1)[0].isdigit()
            pattern = r"\d+\.\s+" if ordered else r"[-*]\s+"
            entries = []
            while i < len(lines) and re.match(pattern, lines[i].strip()):
                entry = re.sub(pattern, "", lines[i].strip(), count=1)
                i += 1
                # indented continuation lines belong to the same bullet
                while i < len(lines) and lines[i].startswith("  ") and lines[i].strip() and not re.match(pattern, lines[i].strip()):
                    entry += " " + lines[i].strip()
                    i += 1
                entries.append(entry)
            tag = "ol" if ordered else "ul"
            items = "".join(f"<li>{_task(inline(e, resolve))}</li>" for e in entries)
            out.append(f"<{tag}>{items}</{tag}>")
            continue
        para = []
        while i < len(lines) and lines[i].strip() and not (para and BLOCK_START.match(lines[i].strip())):
            para.append(lines[i].strip())
            i += 1
        out.append(f"<p>{inline(' '.join(para), resolve)}</p>")
    return "\n".join(out)


def _task(li: str) -> str:
    """'[ ] item' renders as an interactive checklist item."""
    m = re.match(r"\[( |x)\]\s+(.*)", li, re.S)
    if not m:
        return li
    checked = " checked" if m.group(1) == "x" else ""
    return f'<label class="task"><input type="checkbox"{checked}> <span>{m.group(2)}</span></label>'


def plain(text: str, title_of: Callable[[str], str] = lambda i: i) -> str:
    """Strip Markdown to plain text for the search index."""
    text = WIKI.sub(lambda m: m.group(2) or title_of(m.group(1)), text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[#>*`|_]|-{3,}", " ", text)
    return re.sub(r"\s+", " ", text).strip()
