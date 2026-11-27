# Scaffold Knowledge Hub

One searchable place for everything the company knows about scaffolding:
**systems** (what to use and when), **standards & procedures** (what we're measured against),
and **project records** (what we did, the key documents, and the lessons learned).

It is kept current with **CI/CD**: every change is checked automatically before it goes live,
the site republishes itself when a change is approved, and pages past their review date are
flagged to their owners every week.

> Prototype. Project records are sample data, and the technical summaries must be checked by a
> competent person against the current edition of each standard before anyone relies on them.

---

## Quick start

Needs only Python 3.10+ (no other installs).

```bash
python -m hub build          # validates everything, then builds dist/index.html
```

Open `dist/index.html` in any browser. It's a single self-contained file, so it also works offline,
from a shared drive, or on a tablet on site. New users should start with **How to use** in the site's menu
(the guide's source is [`content/help.md`](content/help.md)).

| Command | What it does |
|---|---|
| `python -m hub validate` | Checks every page: required fields, dates, broken links, references |
| `python -m hub build` | Validates, then builds the website into `dist/` |
| `python -m hub stale` | Lists pages past their review date |
| `python -m hub new project riverside-tower` | Starts a new page from a template (`project`, `system` or `guidance`) |
| `python -m unittest discover -s tests -v` | Runs the automated tests |
| `node tests/advisor.test.js` | Runs the advisor scenario tests (after a build; CI does this) |

## How content works

Every page is a plain text Markdown file in `content/`:

```
content/
  systems/    tube-and-fitting.md, cantilever.md, temporary-roof.md ...
  guidance/   tg20.md, work-at-height-regs.md, inspection-regime.md ...
  projects/   victorian-terrace-reroof-hackney.md ...
```

Each file starts with a short header of facts, followed by the write-up:

```markdown
---
title: Cantilever scaffold
summary: A scaffold carried by beams projecting from the building.
category: Special scaffold
design_basis: Bespoke design required
guidance: [design-brief-checklist, temporary-works]
owner: Design Office
last_reviewed: 2026-06-25
review_months: 12
---

## When to use it
When you can't stand a scaffold on the ground... see [[protection-fan]].
```

- `[[page-id]]` links to another page. The hub automatically builds the reverse link, so a
  system page lists every project that used it.
- `owner` + `last_reviewed` + `review_months` drive the "review overdue" badges and the weekly reminder.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for the plain-English editing guide.

## Scaffold Advisor (chat)

Open **Advisor** in the menu (or the 💬 button on any page). Describe the job in plain English, e.g.
*"Re-roof of a Victorian terrace on a busy street, residents staying in"*. The advisor:

1. picks out the situation (roof work, public below, must stay dry, heritage, low rise...);
2. asks only the follow-up questions it still needs (usually 0-2) with one-tap answers;
3. recommends a scaffold system **with reasons**, plus alternatives worth considering, add-ons you'll
   probably need (temporary roof, loading bay, protection fan, stair tower), options it ruled out and why,
   the standards to read first, and similar past jobs.

Links like `#/advisor?ask=bridge%20soffit%20over%20a%20road` start a conversation directly.

**It runs entirely in the page.** There's no AI service, API key or running cost, and it works offline. Its knowledge is ordinary hub content, so
it's reviewed and CI-checked like everything else:

| File | What it holds |
|---|---|
| `content/advisor.json` | The situations it recognises (with the words people use for them) and its follow-up questions |
| `content/systems/*.md` → `role`, `requires`, `suits`, `avoid` | When each system fits, needs or must be ruled out |
| `tests/advisor_cases.json` | Real-sounding job descriptions and the answer the advisor must give. CI fails if a change breaks one |

To teach it something new, add the wording to a factor's `keywords`, or adjust a system's `suits`/`avoid`,
then add a scenario to `tests/advisor_cases.json`.

**Upgrading to an AI chatbot later:** keep this advisor as the grounded rules layer, and add a small
server-side function that sends the conversation plus the relevant hub pages to an LLM (e.g. Claude). That
needs an API key, a host for the function (an API key can never sit in a public web page), and a usage budget.

## How it stays current (CI/CD)

```
 Anyone edits a page ──► Pull request ──► CI checks ──► Owner approves ──► Auto-publish
   (GitHub web editor,      (proposed      (fields, links,   (CODEOWNERS:      (GitHub Pages,
    "Suggest an edit"        change)        dates, tests,     Design Office,    or swap for
    button, or form)                        build)            SHEQ, Contracts)  intranet)

 Every Monday ──► pages past their review date ──► one "Content review due" issue for owners
```

| File | Role |
|---|---|
| `.github/workflows/ci.yml` | Runs on every proposed change. Errors show inline on the exact file. |
| `.github/workflows/deploy.yml` | Publishes the site whenever an approved change lands on `main`. |
| `.github/workflows/review-reminder.yml` | Weekly: opens, updates or closes the "Content review due" issue. |
| `.github/CODEOWNERS` | Makes sure the right team approves changes to its content. |
| `.github/ISSUE_TEMPLATE/` | Forms for "something's wrong" and "add a project" (no Git knowledge needed). |

### Putting it on GitHub

```bash
git init && git add . && git commit -m "Scaffold Knowledge Hub"
gh repo create scaffold-knowledge-hub --private --source . --push
```

Then:

1. In the repo settings, go to **Pages → Source** and choose **GitHub Actions**.
2. Set `"repo"` in `hub.json` to the repo URL. This switches on the "Suggest an edit" buttons.
3. Replace the placeholder team names in `.github/CODEOWNERS`.

For an internal-only hub, keep the repo private and swap the deploy step for SharePoint, Azure Static Web Apps or an intranet server. The build output is just one HTML file.

## Project layout

```
hub/            the engine: content loader, Markdown renderer, validator, site builder, CLI
templates/      the website: index.html, style.css, app.js (search, filters, routing, chat), advisor.js (advisor engine)
content/        the knowledge, one Markdown file per page
tests/          automated tests (run by CI)
hub.json        name, organisation, repo link, disclaimer
```

## Where it could go next

- **Documents:** attach drawings, handover certificates and RAMS to project records (SharePoint/ACC links or Git LFS).
- **Import:** bulk-load past jobs from the existing job spreadsheet or CRM.
- **Tender assistant:** "find past jobs like this one", by systems, borough, height and client.
- **Live data:** pull current inspection status from the scaffold-tagging or inspection app.
- **Sign-in:** SSO-protected hosting, so client information can be stored safely.
