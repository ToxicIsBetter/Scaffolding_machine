"""Run with:  python -m unittest discover -s tests -v"""

import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

from hub import md
from hub.build import build, build_data
from hub.content import ContentError, Item, load, load_advisor, parse_file
from hub.validate import add_months, overdue, validate, validate_advisor

ROOT = Path(__file__).resolve().parent.parent
TODAY = dt.date(2026, 11, 27)


def item(type_, id_, **meta):
    base = {"title": id_, "summary": "s", "owner": "o", "last_reviewed": "2026-01-01", "review_months": 12}
    extra = {
        "system": {"category": "Access scaffold", "design_basis": "TG20 compliance possible", "typical_uses": ["x"], "tags": ["t"], "guidance": ["g"],
                   "role": "structure", "suits": ["facade"]},
        "guidance": {"kind": "Checklist", "reference": "R", "tags": ["t"]},
        "project": {"status": "Live", "location": "L", "client": "C", "start": "2026-01-01", "systems": ["s"], "tags": ["t"]},
    }[type_]
    return Item(type=type_, id=id_, path=f"content/{id_}.md", meta={**base, **extra, **meta}, body="Body text.")


def valid_set():
    return [item("guidance", "g"), item("system", "s"), item("project", "p")]


def errors(items):
    return [i.message for i in validate(items, TODAY) if i.level == "error"]


class ParsingTests(unittest.TestCase):
    def test_front_matter_types(self):
        meta, body = parse_file("---\ntitle: A: b\nn: 3\nf: 1.5\nok: true\nl: [a, b c]\nq: \"x\"\n---\n\n# Hi\n", "t.md")
        self.assertEqual(meta, {"title": "A: b", "n": 3, "f": 1.5, "ok": True, "l": ["a", "b c"], "q": "x"})
        self.assertEqual(body, "# Hi\n")

    def test_missing_front_matter_is_reported(self):
        with self.assertRaises(ContentError):
            parse_file("no header", "t.md")
        with self.assertRaises(ContentError):
            parse_file("---\ntitle: x\n", "t.md")


class MarkdownTests(unittest.TestCase):
    def test_html_is_escaped(self):
        out = md.render("<script>alert(1)</script> **bold**")
        self.assertNotIn("<script>", out)
        self.assertIn("<strong>bold</strong>", out)

    def test_unsafe_link_schemes_are_dropped(self):
        self.assertNotIn("javascript:", md.render("[x](javascript:alert(1))"))
        self.assertIn('href="https://a.b"', md.render("[x](https://a.b)"))

    def test_wiki_links_resolve_or_flag(self):
        resolve = lambda i: ("#/system/a", "Alpha") if i == "a" else None
        self.assertIn('<a href="#/system/a">Alpha</a>', md.render("see [[a]]", resolve))
        self.assertIn('<a href="#/system/a">custom</a>', md.render("see [[a|custom]]", resolve))
        self.assertIn("broken-link", md.render("see [[zzz]]", resolve))

    def test_blocks(self):
        out = md.render("## Head\n\n- one\n- two\n\n1. a\n2. b\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> **Warning:** careful\n\n- [ ] task")
        for frag in ("<h3", "<ul><li>one</li>", "<ol>", "<th>A</th>", "<td>2</td>", "callout warn", 'type="checkbox"'):
            self.assertIn(frag, out)


class ValidationTests(unittest.TestCase):
    def test_valid_set_has_no_errors(self):
        self.assertEqual(errors(valid_set()), [])

    def test_missing_field(self):
        items = valid_set()
        del items[1].meta["summary"]
        self.assertTrue(any("summary" in e for e in errors(items)))

    def test_bad_enum(self):
        items = valid_set()
        items[2].meta["status"] = "Finished"
        self.assertTrue(any("status" in e for e in errors(items)))

    def test_reference_to_missing_page(self):
        items = valid_set()
        items[2].meta["systems"] = ["s", "nope"]
        self.assertTrue(any("'nope'" in e for e in errors(items)))

    def test_reference_to_wrong_type(self):
        items = valid_set()
        items[2].meta["systems"] = ["g"]
        self.assertTrue(any("not a system" in e for e in errors(items)))

    def test_broken_wiki_link(self):
        items = valid_set()
        items[0].body = "See [[ghost]]"
        self.assertTrue(any("[[ghost]]" in e for e in errors(items)))

    def test_dates(self):
        items = valid_set()
        items[2].meta["end"] = "2025-01-01"
        items[1].meta["last_reviewed"] = "2027-01-01"
        msgs = errors(items)
        self.assertTrue(any("before 'start'" in e for e in msgs))
        self.assertTrue(any("future" in e for e in msgs))

    def test_duplicate_and_bad_ids(self):
        items = valid_set() + [item("guidance", "g"), item("guidance", "Bad_Name")]
        msgs = errors(items)
        self.assertTrue(any("duplicate" in e for e in msgs))
        self.assertTrue(any("lower-case" in e for e in msgs))

    def test_overdue_review(self):
        items = valid_set()
        items[0].meta["last_reviewed"] = "2025-01-31"
        self.assertEqual([it.id for it, _ in overdue(items, TODAY)], ["g"])
        self.assertTrue(any(i.level == "warning" and "overdue" in i.message for i in validate(items, TODAY)))

    def test_add_months_clamps(self):
        self.assertEqual(add_months(dt.date(2026, 1, 31), 1), dt.date(2026, 2, 28))
        self.assertEqual(add_months(dt.date(2026, 11, 15), 3), dt.date(2027, 2, 15))


class AdvisorRuleTests(unittest.TestCase):
    ADVISOR = {
        "factors": [{"id": "facade", "label": "F", "reason": "r", "keywords": ["facade"]},
                    {"id": "no_ground", "label": "N", "reason": "r", "keywords": []}],
        "groups": [{"id": "work", "question": "Q?", "ask": True, "options": ["facade"]}],
    }

    def messages(self, items, advisor=None):
        return [i.message for i in validate_advisor(advisor or self.ADVISOR, items) if i.level == "error"]

    def test_valid_rules(self):
        self.assertEqual(self.messages(valid_set()), [])

    def test_unknown_factor_in_system(self):
        items = valid_set()
        items[1].meta["avoid"] = ["lava"]
        self.assertTrue(any("'lava'" in m for m in self.messages(items)))

    def test_suits_and_avoid_clash(self):
        items = valid_set()
        items[1].meta["avoid"] = ["facade"]
        self.assertTrue(any("both" in m for m in self.messages(items)))

    def test_question_with_unknown_option(self):
        bad = {**self.ADVISOR, "groups": [{"id": "work", "question": "Q?", "ask": True, "options": ["roof"]}]}
        self.assertTrue(any("'roof'" in m for m in self.messages(valid_set(), bad)))

    def test_needs_a_structure(self):
        items = valid_set()
        items[1].meta["role"] = "addon"
        self.assertTrue(any("structure" in m for m in self.messages(items)))


class RealContentTests(unittest.TestCase):
    """The actual content in this repo must always pass - this is what CI enforces."""

    def test_repo_content_has_no_errors(self):
        items = load(ROOT)
        self.assertGreater(len(items), 0)
        self.assertEqual(errors(items), [])
        self.assertEqual([i.message for i in validate_advisor(load_advisor(ROOT), items) if i.level == "error"], [])

    def test_build_produces_self_contained_page(self):
        items = load(ROOT)
        with tempfile.TemporaryDirectory() as d:
            page = build(ROOT, items, Path(d)).read_text(encoding="utf-8")
        for placeholder in ("{{TITLE}}", "{{STYLE}}", "{{SCRIPT}}", "{{DATA}}"):
            self.assertNotIn(placeholder, page)
        raw = page.split('id="hub-data">', 1)[1].split("</script>", 1)[0]
        data = json.loads(raw)
        self.assertEqual(len(data["items"]), len(items))

    def test_backlinks(self):
        items = load(ROOT)
        data = build_data(items, {})
        by_id = {i["id"]: i for i in data["items"]}
        # a project that uses a system must appear on that system's page
        for it in items:
            if it.type == "project":
                for sys_id in it.meta["systems"]:
                    self.assertIn(it.id, by_id[sys_id]["related"])


if __name__ == "__main__":
    unittest.main()
