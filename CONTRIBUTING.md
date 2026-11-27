# Updating the hub (no coding needed)

## Fix or update a page

1. Open the page in the hub and click **✎ Suggest an edit**.
2. GitHub opens the page's text. Make your change.
3. If you checked the whole page, set `last_reviewed:` to today's date (YYYY-MM-DD).
4. Click **Propose changes**. The automatic checks run, and the page owner gets asked to approve.
5. Once approved, the hub updates itself within a couple of minutes.

If you'd rather not edit, use **Issues → New issue → "Something is wrong or out of date"**.

## Add a project

Either fill in the **"Add a project record"** form under Issues, or copy an existing file in
`content/projects/` and change it. The most valuable part is **Lessons learned**: what would you
tell the next team doing a similar job?

## The rules the checks enforce

| Rule | Why |
|---|---|
| Every page has `title`, `summary`, `owner`, `last_reviewed`, `review_months` | Every page has someone accountable for it, and a date by which it must be re-checked |
| Dates are written `2026-03-31` | So review reminders work |
| `status` is `Tendering`, `Live` or `Completed` | So filters work |
| `systems: [...]` and `[[links]]` point to pages that exist | No dead ends |
| File names are `lower-case-with-hyphens.md` | Stable web links |

If a check fails, the pull request shows exactly which file and line to fix.

## Writing tips

- Start with **when to use it**, then **requirements**, then **pitfalls**.
- Link generously with `[[page-id]]`. The hub builds the reverse links for you.
- Quote standard **editions** (e.g. TG20:21), because standards change.
- `> **Warning:** ...` makes an orange call-out box. `- [ ] item` makes a tick-box checklist.
