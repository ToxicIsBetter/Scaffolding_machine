# Demo script (about 12 minutes)

**The pitch in one line:** *"Everything the company knows about scaffolding (systems, standards,
past jobs and lessons learned) in one searchable place that keeps itself up to date."*

Before the call, run `python -m hub build` and open `dist/index.html`.

## 1. The problem (30 s)

"Right now this knowledge lives in people's heads, old emails, job folders and PDFs of standards.
When a new tender comes in, or someone new joins, it's hard to find what we did last time and
what rules apply."

## 2. Home page (1 min)

- Point at the four counters: systems, standards, projects, live jobs.
- **"Find a system by the problem"** chips: click **no ground bearing**. That filters to cantilever and suspended scaffolds.
- **Needs attention**: "These two pages are past their review date. The system flags it, so nobody has to remember."

## 3. Search (1.5 min)

Press `/` and type:

- `no ground` → systems, the tender, and the precedent job
- `hackney` → every job in that borough, with lessons about the highway licence
- `ties` → TG4, TG20, and every project where ties mattered

"It searches the titles, the facts and the full text, and works offline."

## 3b. Scaffold Advisor (2 min): the "wow" moment

Click **Ask the advisor** on the home page.

1. Click the example **"Re-roof of a Victorian terrace on a busy street, residents staying in"**.
   It picks out roof work, public below, must stay dry, heritage, low rise, and asks only **one** question (ground). Answer **Yes - firm ground**.
2. Walk through the answer. Recommended: independent tied. Also consider: tube and fitting or a system scaffold. Likely needed: a **temporary roof**. Then the add-ons, what's ruled out (Kwikstage, irregular building), the standards to read, and the **Hackney job** as precedent.
3. Type: **"actually it's a closed site"**. The public factor changes and the advice updates live.
4. **Start a new job**: *"Stone repairs on the upper floors of a city office"* → **Yes - pavement** → **10-30 m**
   → **Cantilever**, with ground-based systems ruled out and the City office job listed first.

Key line: *"It's not a black box. Every recommendation says why, and the rules are on each system's page, owned by the
Design Office and checked by CI. When the hub improves, the advice improves."*

If asked about AI: *"This is the deterministic layer. An LLM like Claude can sit on top for messier questions, grounded in the
same reviewed content. That needs an API key and a small server."*

## 4. A system page: *Cantilever scaffold* (1.5 min)

- Key facts panel: design basis is **bespoke design required**.
- **Connected → Where we've used it**: the City office job. "Nobody typed that link. Because the project says it used a cantilever, the hub links it both ways."
- **Print / PDF**: a clean handout for site.

## 5. A project page: *Victorian terrace re-roof - Hackney* (1.5 min)

- Systems used, document refs, and **lessons learned**: "The highway licence took 6 weeks, not 3."
- "This is the knowledge that normally walks out the door when someone leaves."
- Then the tender, *Railway bridge*: it links to its precedent. "When we price a new job, we start from what we've learned."

## 6. Standards page: *Load classes* or *Inspection regime* (1 min)

- Tables and tick-box checklists usable on a tablet on site.
- Each page has an **owner** and a **next review** date.

## 7. How it stays current: CI/CD (2 min)

Show the repo (or the `.github/workflows` folder):

1. **Anyone** can click *Suggest an edit*, or fill in a form. No Git knowledge is needed.
2. **CI** checks every change automatically. Break a link, and it's stopped with a message pointing at the exact line. (Live demo: change `systems: [cantilever]` to `systems: [cantileverr]` and run `python -m hub validate`.)
3. The **right person approves**. The Design Office owns systems, SHEQ owns standards, Contracts owns projects.
4. **CD** republishes the site automatically.
5. **Every Monday**, a bot lists overdue pages for their owners.

## 8. Where it goes next (1 min)

- Load in their real past jobs, from the job spreadsheet or folders.
- Link the drawings, handover certs and RAMS from SharePoint or ACC.
- Host it privately behind company sign-in.
- "Find similar past jobs" for estimators.

## Honest caveats to say out loud

- The project records are **sample data**. The real value comes from loading their own jobs.
- The standards summaries are a starting point and need sign-off by their competent people.
  The review-date system is how that sign-off is tracked.
