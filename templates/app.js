(() => {
  "use strict";

  const DATA = JSON.parse(document.getElementById("hub-data").textContent);
  const C = DATA.config || {};
  const ITEMS = DATA.items;
  const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  const app = document.getElementById("app");
  const qInput = document.getElementById("q");

  const TYPE = {
    system: { label: "Scaffold system", plural: "Scaffold systems", route: "systems" },
    guidance: { label: "Standard / procedure", plural: "Standards & procedures", route: "guidance" },
    project: { label: "Project", plural: "Projects", route: "projects" },
  };
  const ROUTE_TYPE = { systems: "system", guidance: "guidance", projects: "project" };

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const iso = (d) => d.toISOString().slice(0, 10);
  const TODAY = iso(new Date());
  const SOON = iso(new Date(Date.now() + 30 * 864e5));
  const href = (it) => `#/${it.type}/${it.id}`;
  const fmtDate = (s) => {
    if (!s) return "";
    const d = new Date(s + "T00:00:00");
    return isNaN(d) ? esc(s) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  const ofType = (t) => ITEMS.filter((i) => i.type === t);
  const link = (id) => (BY_ID[id] ? `<a href="${href(BY_ID[id])}">${esc(BY_ID[id].title)}</a>` : esc(id));
  const typeBadge = (t) => `<span class="badge dot t-${t}">${TYPE[t].label}</span>`;
  const statusBadge = (s) => (s ? `<span class="badge s-${esc(s)}">${esc(s)}</span>` : "");

  function reviewState(it) {
    if (!it.review_due) return null;
    if (it.review_due < TODAY) return "overdue";
    if (it.review_due <= SOON) return "soon";
    return "ok";
  }
  function reviewBadge(it, verbose) {
    const s = reviewState(it);
    if (!s) return "";
    const text = { overdue: "Review overdue", soon: "Review due soon", ok: "Up to date" }[s];
    return `<span class="badge ${s}" title="Next review: ${fmtDate(it.review_due)}">${text}${verbose ? " · " + fmtDate(it.review_due) : ""}</span>`;
  }
  function countBy(list, fn) {
    const m = new Map();
    list.forEach((x) => [].concat(fn(x) || []).forEach((k) => m.set(k, (m.get(k) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0]));
  }

  // ---------- search ----------
  const norm = (s) => String(s ?? "").toLowerCase();
  const INDEX = ITEMS.map((it) => ({
    it,
    title: norm(it.title),
    tags: norm([].concat(it.meta.tags || [], it.meta.typical_uses || [], it.meta.reference || []).join(" ")),
    summary: norm(it.summary),
    meta: norm(Object.values(it.meta).flat().join(" ")),
    text: norm(it.text),
  }));

  // Terms match at the start of a word ("tie" finds "ties", but "no" doesn't find "nobody").
  const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Very short terms ("no", "3") must be whole words, otherwise they match everything.
  const termRe = (t, flags = "") =>
    new RegExp("(^|[^\\p{L}\\p{N}])(" + reEsc(t) + ")" + (t.length <= 2 ? "(?![\\p{L}\\p{N}])" : ""), "u" + flags);

  function search(q) {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const res = terms.map((t) => termRe(t));
    const phrase = norm(q).trim();
    const out = [];
    for (const d of INDEX) {
      let score = 0;
      let all = true;
      for (const re of res) {
        let s = 0;
        if (re.test(d.title)) s += 10;
        if (re.test(d.tags)) s += 5;
        if (re.test(d.summary)) s += 3;
        if (re.test(d.meta)) s += 2;
        if (re.test(d.text)) s += 1;
        if (!s) { all = false; break; }
        score += s;
      }
      if (!all) continue;
      if (terms.length > 1 && (d.title + " " + d.tags + " " + d.summary + " " + d.text).includes(phrase)) score += 6;
      if (d.title.startsWith(phrase)) score += 8;
      out.push({ it: d.it, score });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  function highlight(text, terms) {
    let h = esc(text);
    terms.forEach((t) => {
      h = h.replace(termRe(esc(t), "gi"), (m, pre, word) => `${pre}<mark>${word}</mark>`);
    });
    return h;
  }

  function snippet(it, terms) {
    const text = it.text || it.summary;
    const lower = text.toLowerCase();
    let pos = -1;
    for (const t of terms) { const m = termRe(t).exec(lower); if (m) { pos = m.index + m[1].length; break; } }
    if (pos < 0) return highlight(it.summary, terms);
    const start = Math.max(0, pos - 70);
    const cut = text.slice(start, start + 220);
    return (start ? "…" : "") + highlight(cut, terms) + (start + 220 < text.length ? "…" : "");
  }

  // ---------- views ----------
  function card(it) {
    const extra =
      it.type === "project"
        ? `${statusBadge(it.meta.status)}<span class="muted small">${esc(it.meta.location || "")}</span>`
        : it.type === "system"
        ? `<span class="badge">${esc(it.meta.category)}</span><span class="badge">${esc(it.meta.design_basis)}</span>`
        : `<span class="badge">${esc(it.meta.kind)}</span><span class="muted small">${esc(it.meta.reference)}</span>`;
    const state = reviewState(it);
    return `<a class="card c-${it.type}" href="${href(it)}">
      <h3>${esc(it.title)}</h3><p>${esc(it.summary)}</p>
      <div class="row">${extra}${state === "overdue" ? reviewBadge(it) : ""}</div></a>`;
  }

  function viewHome() {
    const systems = ofType("system"), guidance = ofType("guidance"), projects = ofType("project");
    const live = projects.filter((p) => p.meta.status === "Live");
    const due = ITEMS.filter((i) => ["overdue", "soon"].includes(reviewState(i))).sort((a, b) => a.review_due.localeCompare(b.review_due));
    const tags = countBy(systems, (s) => s.meta.tags).slice(0, 14);
    const recent = [...ITEMS].sort((a, b) => String(b.meta.last_reviewed).localeCompare(String(a.meta.last_reviewed))).slice(0, 5);

    return `
    <section class="hero">
      <h1>${esc(C.tagline || "Everything about our scaffolding, in one place.")}</h1>
      <p class="lede">Search by system, standard, borough, client or problem — e.g. <a href="#/search?q=ties">ties</a>,
        <a href="#/search?q=no%20ground">no ground</a>, <a href="#/search?q=highway%20licence">highway licence</a>,
        <a href="#/search?q=Hackney">Hackney</a>. Press <kbd>/</kbd> to search from anywhere.</p>
      ${ADV ? `<a class="advisor-cta" href="#/advisor"><span class="cta-icon" aria-hidden="true">💬</span>
        <span><b>Not sure which scaffold to use?</b><br>Describe the job to the Scaffold Advisor and get a recommendation, alternatives and what else you'll need.</span>
        <span class="btn primary">Ask the advisor →</span></a>` : ""}
      ${DATA.help ? `<p class="small muted" style="margin:6px 0 0">New here? Read the <a href="#/help">5-minute guide</a>.</p>` : ""}
      <div class="stats">
        <a class="stat" style="--c:var(--system)" href="#/systems"><b>${systems.length}</b><span>Scaffold systems</span></a>
        <a class="stat" style="--c:var(--guidance)" href="#/guidance"><b>${guidance.length}</b><span>Standards &amp; procedures</span></a>
        <a class="stat" style="--c:var(--project)" href="#/projects"><b>${projects.length}</b><span>Project records</span></a>
        <a class="stat" style="--c:var(--accent)" href="#/projects?status=Live"><b>${live.length}</b><span>Live projects</span></a>
      </div>
    </section>

    <div class="home-grid">
      <div>
        <div class="section-head"><h2>Find a system by the problem</h2><a class="small" href="#/systems">All systems →</a></div>
        <div class="chips">${tags.map(([t, n]) => `<a class="chip" href="#/systems?tag=${encodeURIComponent(t)}">${esc(t)} <span class="n">${n}</span></a>`).join("")}</div>

        <div class="section-head"><h2>Live projects</h2><a class="small" href="#/projects">All projects →</a></div>
        ${live.length ? `<div class="cards">${live.map(card).join("")}</div>` : `<p class="muted">No live projects.</p>`}

        <div class="section-head"><h2>Core standards</h2><a class="small" href="#/guidance">All →</a></div>
        <div class="cards">${guidance.filter((g) => g.meta.core).map(card).join("")}</div>
      </div>

      <aside>
        <div class="section-head"><h2>Needs attention</h2></div>
        <div class="panel">
          ${due.length ? `<ul class="mini">${due.map((i) => `<li><a href="${href(i)}">${esc(i.title)}</a>${reviewBadge(i)}</li>`).join("")}</ul>
            <p class="small muted" style="margin:10px 0 0">Owners get a weekly GitHub reminder until these are re-checked.</p>`
            : `<p class="muted">Every page is within its review date.</p>`}
        </div>
        <div class="section-head"><h2>Recently reviewed</h2></div>
        <div class="panel"><ul class="mini">${recent.map((i) => `<li><a href="${href(i)}">${esc(i.title)}</a><span class="muted small nowrap">${fmtDate(i.meta.last_reviewed)}</span></li>`).join("")}</ul></div>
      </aside>
    </div>

    <div class="section-head"><h2>How this hub stays current</h2></div>
    <div class="panel">
      <div class="flow">
        <div><span class="num">1</span><b>Anyone suggests a change</b>Click “Suggest an edit” on any page, or raise a request form.</div>
        <div><span class="num">2</span><b>Automatic checks</b>Every change is validated: required fields, broken links, dates, references.</div>
        <div><span class="num">3</span><b>Owner approves</b>The page owner reviews it. Nothing goes live unchecked.</div>
        <div><span class="num">4</span><b>Published in minutes</b>The site rebuilds automatically. Stale pages are flagged weekly.</div>
      </div>
    </div>`;
  }

  function viewList(type, params) {
    const all = ofType(type);
    const facets = {
      system: [{ key: "category", label: "Category" }, { key: "tag", label: "Need", field: "tags" }],
      guidance: [{ key: "kind", label: "Type" }, { key: "tag", label: "Topic", field: "tags" }],
      project: [{ key: "status", label: "Status" }, { key: "system", label: "System", field: "systems", select: true }, { key: "borough", label: "Borough" }],
    }[type];

    const state = Object.fromEntries(facets.map((f) => [f.key, params.get(f.key) || ""]));
    state.q = params.get("q") || "";

    const valueOf = (it, f) => it.meta[f.field || f.key];
    const facetHtml = facets.map((f) => {
      const values = countBy(all, (it) => valueOf(it, f));
      if (f.select || values.length > 8) {
        return `<select data-facet="${f.key}" aria-label="${f.label}"><option value="">${f.label}: all</option>${values
          .map(([v, n]) => `<option value="${esc(v)}" ${state[f.key] === v ? "selected" : ""}>${esc(f.key === "system" && BY_ID[v] ? BY_ID[v].title : v)} (${n})</option>`)
          .join("")}</select>`;
      }
      return `<div class="chips" role="group" aria-label="${f.label}">${values
        .map(([v, n]) => `<button class="chip" type="button" data-facet="${f.key}" data-value="${esc(v)}" aria-pressed="${state[f.key] === v}">${esc(v)} <span class="n">${n}</span></button>`)
        .join("")}</div>`;
    }).join("");

    app.innerHTML = `
      <div class="crumbs"><a href="#/">Home</a> / ${TYPE[type].plural}</div>
      <h1>${TYPE[type].plural}</h1>
      <p class="lede">${{
        system: "Every scaffold type we design and erect: when to use it, what it needs, and where we've used it before.",
        guidance: "The legislation, industry guidance, standards and company procedures our work is measured against.",
        project: "Past and live jobs, with the systems used, key documents and lessons learned. Use these as the starting point for new tenders.",
      }[type]}</p>
      <div class="toolbar">
        <input type="search" id="filter" placeholder="Filter ${TYPE[type].plural.toLowerCase()}…" value="${esc(state.q)}" aria-label="Filter">
        ${facetHtml}
        <span class="count" id="count"></span>
      </div>
      <div id="results"></div>`;

    const results = document.getElementById("results");
    const count = document.getElementById("count");

    function sync() {
      const p = new URLSearchParams();
      Object.entries(state).forEach(([k, v]) => v && p.set(k, v));
      const qs = p.toString();
      history.replaceState(null, "", `#/${TYPE[type].route}${qs ? "?" + qs : ""}`);
    }

    function draw() {
      const terms = norm(state.q).split(/\s+/).filter(Boolean);
      const list = all.filter((it) => {
        for (const f of facets) {
          const want = state[f.key];
          if (want && ![].concat(valueOf(it, f) || []).includes(want)) return false;
        }
        const hay = INDEX.find((d) => d.it === it);
        return terms.every((t) => { const re = termRe(t); return re.test(hay.title) || re.test(hay.meta) || re.test(hay.text); });
      });
      count.textContent = `${list.length} of ${all.length}`;
      if (!list.length) {
        results.innerHTML = `<div class="empty">Nothing matches those filters.</div>`;
        return;
      }
      if (type === "project") {
        list.sort((a, b) => String(b.meta.start).localeCompare(String(a.meta.start)));
        results.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Status</th><th class="hide-sm">Systems</th><th class="hide-sm">Dates</th></tr></thead><tbody>${list
          .map((p) => `<tr><td><a class="title" href="${href(p)}">${esc(p.title)}</a><span class="sub">${esc(p.meta.location)} · ${esc(p.meta.client)}</span></td>
            <td>${statusBadge(p.meta.status)}</td>
            <td class="hide-sm small">${(p.meta.systems || []).map(link).join(", ")}</td>
            <td class="hide-sm small nowrap">${fmtDate(p.meta.start)}${p.meta.end ? " – " + fmtDate(p.meta.end) : ""}</td></tr>`)
          .join("")}</tbody></table></div>`;
      } else {
        results.innerHTML = `<div class="cards">${list.map(card).join("")}</div>`;
      }
    }

    app.querySelector("#filter").addEventListener("input", (e) => { state.q = e.target.value; sync(); draw(); });
    app.querySelectorAll("button[data-facet]").forEach((b) =>
      b.addEventListener("click", () => {
        const k = b.dataset.facet;
        state[k] = state[k] === b.dataset.value ? "" : b.dataset.value;
        app.querySelectorAll(`button[data-facet="${k}"]`).forEach((x) => x.setAttribute("aria-pressed", String(state[k] === x.dataset.value)));
        sync(); draw();
      }));
    app.querySelectorAll("select[data-facet]").forEach((s) =>
      s.addEventListener("change", () => { state[s.dataset.facet] = s.value; sync(); draw(); }));
    draw();
    return null;
  }

  function facts(it) {
    const m = it.meta;
    const rows = [];
    const add = (k, v) => v && rows.push(`<dt>${k}</dt><dd>${v}</dd>`);
    const list = (arr, fn = esc) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${fn(x)}</li>`).join("")}</ul>` : "");
    if (it.type === "system") {
      add("Category", esc(m.category));
      add("Design", esc(m.design_basis));
      add("Typical uses", list(m.typical_uses));
    } else if (it.type === "guidance") {
      add("Type", esc(m.kind));
      add("Reference", esc(m.reference));
      if (m.url) add("Source", `<a href="${esc(m.url)}" target="_blank" rel="noopener">Official page ↗</a>`);
    } else {
      add("Status", statusBadge(m.status));
      add("Client", esc(m.client));
      add("Location", esc(m.location) + (m.borough ? `<br><span class="muted">${esc(m.borough)}</span>` : ""));
      add("Dates", fmtDate(m.start) + (m.end ? " – " + fmtDate(m.end) : " – ongoing"));
      if (m.max_height_m) add("Max height", `${esc(m.max_height_m)} m`);
      if (m.load_class) add("Load class", esc(m.load_class));
      add("Design ref", esc(m.design_ref));
      add("Systems", list(m.systems, link));
    }
    add("Owner", esc(m.owner));
    add("Reviewed", fmtDate(m.last_reviewed));
    add("Next review", it.review_due ? `${fmtDate(it.review_due)} ${reviewBadge(it)}` : "");
    return `<dl class="facts">${rows.join("")}</dl>`;
  }

  function viewDetail(it) {
    const groups = { system: [], guidance: [], project: [] };
    it.related.forEach((id) => BY_ID[id] && groups[BY_ID[id].type].push(BY_ID[id]));
    const relTitle = {
      system: it.type === "project" ? "Systems used" : "Related systems",
      guidance: "Standards & procedures",
      project: it.type === "project" ? "Related projects" : "Where we've used it",
    };
    const related = Object.entries(groups).filter(([, l]) => l.length).map(([t, l]) =>
      `<div class="rel-group"><h5 class="t-${t}">${relTitle[t]} (${l.length})</h5><ul>${l
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((x) => `<li><a href="${href(x)}">${esc(x.title)}</a>${x.type === "project" ? " " + statusBadge(x.meta.status) : ""}</li>`)
        .join("")}</ul></div>`).join("");

    const edit = it.edit_url
      ? `<a class="btn" href="${esc(it.edit_url)}" target="_blank" rel="noopener">✎ Suggest an edit</a>`
      : `<span class="btn" title="Set &quot;repo&quot; in hub.json to enable GitHub editing">✎ Suggest an edit</span>`;
    const tags = (it.meta.tags || []).map((t) => `<a class="chip" href="#/${TYPE[it.type].route}?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join("");

    return `
      <div class="crumbs"><a href="#/">Home</a> / <a href="#/${TYPE[it.type].route}">${TYPE[it.type].plural}</a></div>
      <div class="detail">
        <article class="doc">
          <div class="chips" style="margin-top:8px">${typeBadge(it.type)}${it.type === "project" ? statusBadge(it.meta.status) : ""}${reviewBadge(it)}</div>
          <h1>${esc(it.title)}</h1>
          <p class="lede">${esc(it.summary)}</p>
          ${it.type === "project" && it.meta.sample ? `<div class="callout"><p><strong>Sample record.</strong> This project is illustrative demo data, not a real job.</p></div>` : ""}
          ${it.html}
          ${tags && it.type !== "project" ? `<div class="chips" style="margin-top:24px">${tags}</div>` : ""}
          <div class="actions">
            ${edit}
            <button class="btn" type="button" data-copy>🔗 Copy link</button>
            <button class="btn" type="button" onclick="window.print()">⎙ Print / PDF</button>
          </div>
          <p class="small muted">Source: <code>${esc(it.path)}</code></p>
        </article>
        <aside>
          <div class="panel"><h4>Key facts</h4>${facts(it)}</div>
          ${related ? `<div class="panel"><h4>Connected</h4>${related}</div>` : ""}
        </aside>
      </div>`;
  }

  function viewSearch(q) {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    const res = search(q);
    const byType = countBy(res, (r) => r.it.type);
    return `
      <div class="crumbs"><a href="#/">Home</a> / Search</div>
      <h1>${res.length} result${res.length === 1 ? "" : "s"} for “${esc(q)}”</h1>
      <div class="chips" style="margin-bottom:8px">${byType.map(([t, n]) => `<span class="badge dot t-${t}">${TYPE[t].plural}: ${n}</span>`).join("")}</div>
      ${res.length
        ? res.map(({ it }) => `<div class="result">
            <div class="chips" style="margin-bottom:4px">${typeBadge(it.type)}${it.type === "project" ? statusBadge(it.meta.status) : ""}</div>
            <a class="title" href="${href(it)}">${highlight(it.title, terms)}</a>
            <p>${snippet(it, terms)}</p></div>`).join("")
        : `<div class="empty"><p>No matches. Try fewer words, or browse <a href="#/systems">systems</a>, <a href="#/guidance">standards</a> or <a href="#/projects">projects</a>.</p></div>`}`;
  }

  // ---------- Scaffold Advisor (chat) ----------
  // The conversation lives in memory, so users can open a linked page and come back to it.
  const ADV = window.HubAdvisor && DATA.advisor ? window.HubAdvisor.create(DATA) : null;
  const EXAMPLES = [
    "Re-roof of a Victorian terrace on a busy street, residents staying in",
    "Stone repairs on the upper floors of a city office - the pavement must stay clear",
    "Brickwork on a 16 storey new build residential block",
    "Replace the ceiling in a church nave, about 15m high",
  ];
  const chat = { messages: [], present: new Set(), asked: new Set(), recommended: false, busy: false };

  function chatReset() {
    chat.messages = [];
    chat.present = new Set();
    chat.asked = new Set();
    chat.recommended = false;
    botSay(`<p>Hi, I'm the <strong>Scaffold Advisor</strong>. Describe the job in a sentence: what the work is, what the
      building is like, and anything awkward about access. I'll suggest the scaffold to use, other options worth considering,
      and what else you'll need.</p>`, EXAMPLES.map((t) => ({ kind: "example", label: t })));
  }

  function botSay(html, replies) { chat.messages.push({ from: "bot", html, replies: replies || [] }); }
  function userSay(text) { chat.messages.push({ from: "user", html: esc(text) }); }
  const factorChips = (ids) => ids.map((id) => `<span class="badge fchip">${esc(ADV.label(id))}</span>`).join(" ");

  function applyFactor(fid) {
    ADV.rivals(fid).forEach((r) => chat.present.delete(r));
    chat.present.add(fid);
  }

  function handleText(text) {
    userSay(text);
    const before = new Set(chat.present);
    const { factors } = ADV.extract(text);
    factors.forEach(applyFactor);
    const added = [...chat.present].filter((f) => !before.has(f));
    if (chat.recommended) {
      if (added.length) botSay(`<p>Updated with: ${factorChips(added)}</p>`);
      else botSay(`<p>I couldn't pick out anything new there. Try terms like <em>pavement</em>, <em>occupied</em>,
        <em>over a road</em>, <em>16 storeys</em> or <em>listed</em>, or start again.</p>`, [{ kind: "reset", label: "Start a new job" }]);
      if (added.length) giveRecommendation();
      return;
    }
    if (added.length) botSay(`<p>Got it. I picked up: ${factorChips(added)}</p>`);
    else if (!chat.present.size) botSay(`<p>I couldn't pick out the details from that, so let's go step by step.</p>`);
    advance();
  }

  function handleReply(r) {
    if (r.kind === "example") return handleText(r.label);
    if (r.kind === "reset") { chatReset(); return; }
    if (r.kind === "recommend") { userSay(r.label); return giveRecommendation(); }
    if (r.kind === "answer") {
      userSay(r.label);
      chat.asked.add(r.group);
      if (r.factor) applyFactor(r.factor);
      return advance();
    }
  }

  function advance() {
    const q = ADV.nextQuestion(chat.present, chat.asked);
    if (q && chat.asked.size < 4) {
      const replies = q.options.map((o) => ({ kind: "answer", group: q.id, factor: o.factor, label: o.label }));
      replies.push({ kind: "answer", group: q.id, factor: null, label: q.options.length === 1 ? "No" : "Not sure / skip" });
      if (chat.present.size >= 2) replies.push({ kind: "recommend", label: "Just give me the answer" });
      botSay(`<p>${esc(q.question)}</p>`, replies);
      return;
    }
    giveRecommendation();
  }

  function why(ids) { return ids.map((id) => esc(ADV.reason(id))).join(", "); }

  function giveRecommendation() {
    chat.recommended = true;
    const r = ADV.recommend(chat.present);
    if (!r.primary) {
      botSay(`<p>I don't have enough to go on yet. What's the work: façade, roof, inside at high level, or over a road or water?
        Or <a href="#/systems">browse all systems</a>.</p>`, [{ kind: "reset", label: "Start again" }]);
      chat.recommended = false;
      chat.asked.delete("work");
      return;
    }
    const p = r.primary.item;
    const sysLine = (x) => `<a href="${href(x.item)}">${esc(x.item.title)}</a>`;
    let html = `<div class="rec">
      <div class="rec-primary">
        <div class="rec-label">Recommended</div>
        <h3><a href="${href(p)}">${esc(p.title)}</a></h3>
        <p>${esc(p.summary)}</p>
        <p class="small"><strong>Why:</strong> ${why(r.primary.reasons)}.</p>
        <div class="chips"><span class="badge">${esc(p.meta.design_basis)}</span><span class="badge">${esc(p.meta.category)}</span></div>
      </div>`;
    if (r.alternatives.length) {
      html += `<h4>Also consider</h4><ul class="rec-list">${r.alternatives.map((a) =>
        `<li>${sysLine(a)}: <span class="muted">${esc(a.item.summary)}</span> <span class="small">Fits because ${why(a.reasons)}.</span></li>`).join("")}</ul>`;
    }
    if (r.addons.length) {
      html += `<h4>You'll probably need alongside it</h4><ul class="rec-list">${r.addons.map((a) =>
        `<li><span class="badge ${a.level === "likely" ? "s-Live" : "s-Tendering"}">${a.level === "likely" ? "Likely needed" : "Consider"}</span>
          ${sysLine(a)}: ${why(a.reasons)}.</li>`).join("")}</ul>`;
    }
    if (r.unsuitable.length) {
      html += `<h4>Ruled out</h4><ul class="rec-list">${r.unsuitable.slice(0, 4).map((u) =>
        `<li>${sysLine(u)}: not suitable because ${why(u.because)}.</li>`).join("")}</ul>`;
    }
    if (r.guidance.length) {
      html += `<h4>Read before you design or price it</h4><div class="chips">${r.guidance.map((g) =>
        `<a class="chip" href="${href(g)}">${esc(g.title)}</a>`).join("")}</div>`;
    }
    if (r.similar.length) {
      html += `<h4>Similar past jobs</h4><ul class="rec-list">${r.similar.map((s) =>
        `<li><a href="${href(s)}">${esc(s.title)}</a> ${statusBadge(s.meta.status)}</li>`).join("")}</ul>`;
    }
    if (r.bespoke) html += `<div class="callout warn"><p><strong>Important:</strong> this needs a <strong>bespoke design</strong>. Raise a design brief before pricing in detail.</p></div>`;
    if (r.confidence === "low") html += `<p class="small muted">I'm working from limited detail. Tell me more (height, access, who's below) for a sharper answer.</p>`;
    html += `<p class="small muted rec-caveat">A starting point based on the hub's rules, not a design. A competent scaffold designer must confirm the solution.</p></div>`;
    botSay(html, [{ kind: "reset", label: "Start a new job" }]);
  }

  function viewAdvisor() {
    if (!ADV) return `<div class="empty"><h1>Advisor unavailable</h1><p>No advisor rules found (content/advisor.json).</p></div>`;
    if (!chat.messages.length) chatReset();
    return `
      <div class="crumbs"><a href="#/">Home</a> / Scaffold Advisor</div>
      <div class="advisor">
        <section class="chat" aria-label="Conversation">
          <h1>Scaffold Advisor</h1>
          <div id="chat-log" class="chat-log" aria-live="polite"></div>
          <form id="chat-form" class="chat-input">
            <input id="chat-text" type="text" autocomplete="off" placeholder="Describe the job, or add a detail…" aria-label="Message">
            <button class="btn primary" type="submit">Send</button>
          </form>
        </section>
        <aside>
          <div class="panel"><h4>What I've understood</h4><div id="chat-facts"></div>
            <p class="small muted" style="margin:10px 0 0">Click a detail to remove it.</p></div>
          <div class="panel small"><h4>How it decides</h4>
            <p style="margin:0">Each scaffold system's page lists the situations it <em>suits</em>, <em>needs</em> and must <em>avoid</em>.
            The advisor matches your job against those rules. It uses the same reviewed content as the rest of the hub, so improving a page
            improves the advice.</p></div>
        </aside>
      </div>`;
  }

  function drawChat() {
    const log = document.getElementById("chat-log");
    if (!log) return;
    const last = chat.messages.length - 1;
    log.innerHTML = chat.messages.map((m, i) => `
      <div class="msg ${m.from}"><div class="bubble">${m.html}</div>
        ${i === last && m.replies && m.replies.length && !chat.busy ? `<div class="replies">${m.replies.map((r, j) =>
          `<button type="button" class="chip${r.kind === "example" ? " example" : ""}" data-reply="${j}">${esc(r.label)}</button>`).join("")}</div>` : ""}
      </div>`).join("") + (chat.busy ? `<div class="msg bot"><div class="bubble typing"><span></span><span></span><span></span></div></div>` : "");
    log.querySelectorAll("[data-reply]").forEach((b) => b.addEventListener("click", () => {
      const r = chat.messages[last].replies[+b.dataset.reply];
      if (r.kind === "reset") respond(() => handleReply(r));
      else send(r.label, () => handleReply(r));
    }));
    const facts = document.getElementById("chat-facts");
    facts.innerHTML = chat.present.size
      ? `<div class="chips">${[...chat.present].map((id) => `<button type="button" class="chip" data-drop="${esc(id)}" title="Remove">${esc(ADV.label(id))} ✕</button>`).join("")}</div>`
      : `<p class="muted small" style="margin:0">Nothing yet. Describe the job to start.</p>`;
    facts.querySelectorAll("[data-drop]").forEach((b) => b.addEventListener("click", () => {
      chat.present.delete(b.dataset.drop);
      if (chat.recommended) respond(() => { botSay(`<p>Removed <strong>${esc(ADV.label(b.dataset.drop))}</strong>. Here's the updated advice.</p>`); giveRecommendation(); });
      else drawChat();
    }));
    log.lastElementChild && log.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // Show the user's message at once; the handler re-adds it for real after the pause.
  function send(label, fn) {
    if (chat.busy) return;
    chat.messages.push({ from: "user", html: esc(label), pending: true });
    respond(() => { chat.messages = chat.messages.filter((m) => !m.pending); fn(); });
  }

  // Short "typing" pause so the conversation reads naturally.
  function respond(fn) {
    if (chat.busy) return;
    chat.busy = true;
    drawChat();
    setTimeout(() => { chat.busy = false; fn(); drawChat(); }, 450);
  }

  function bindAdvisor(params) {
    const form = document.getElementById("chat-form");
    if (!form) return;
    const input = document.getElementById("chat-text");
    // Shareable links: #/advisor?ask=re-roof%20of%20a%20terrace starts the conversation for you.
    const ask = params && params.get("ask");
    if (ask) {
      history.replaceState(null, "", "#/advisor");
      chatReset();
      handleText(ask);
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || chat.busy) return;
      input.value = "";
      send(text, () => handleText(text));
    });
    drawChat();
    if (matchMedia("(min-width: 721px)").matches) input.focus();
  }

  function viewHelp() {
    const h = DATA.help;
    const edit = h.edit_url ? `<a class="btn" href="${esc(h.edit_url)}" target="_blank" rel="noopener">✎ Suggest an edit</a>` : "";
    const toc = [...h.html.matchAll(/<h3 id="([^"]+)">(.*?)<\/h3>/g)]
      .map((m) => `<li><a href="#/help" data-jump="${m[1]}">${m[2]}</a></li>`).join("");
    setTimeout(() => app.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const t = document.getElementById(a.dataset.jump);
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    })));
    return `
      <div class="crumbs"><a href="#/">Home</a> / How to use</div>
      <div class="detail">
        <article class="doc help">
          <h1>${esc(h.title)}</h1>
          <p class="lede">${esc(h.summary)}</p>
          ${h.html}
          <div class="actions">${edit}<button class="btn" type="button" onclick="window.print()">⎙ Print / PDF</button></div>
        </article>
        <aside><div class="panel toc"><h4>On this page</h4><ol>${toc}</ol></div>
          <a class="btn primary" style="width:100%;justify-content:center" href="#/advisor">💬 Try the Scaffold Advisor</a></aside>
      </div>`;
  }

  // ---------- router ----------
  function render() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, qs] = raw.split("?");
    const params = new URLSearchParams(qs || "");
    const [a, b] = path.split("/");
    let section = "home", html = null;

    if (!a) html = viewHome();
    else if (a === "search") { html = viewSearch(params.get("q") || ""); section = "search"; }
    else if (a === "advisor") { html = viewAdvisor(); section = "advisor"; }
    else if (a === "help" && DATA.help) { html = viewHelp(); section = "help"; }
    else if (ROUTE_TYPE[a] && !b) { section = a; html = viewList(ROUTE_TYPE[a], params); }
    else if (TYPE[a] && BY_ID[b] && BY_ID[b].type === a) { section = TYPE[a].route; html = viewDetail(BY_ID[b]); document.title = `${BY_ID[b].title} · ${C.name}`; }
    else html = `<div class="empty"><h1>Page not found</h1><p><a href="#/">Back to the home page</a></p></div>`;

    if (html !== null) app.innerHTML = html;
    if (!(TYPE[a] && BY_ID[b])) document.title = C.name || "Knowledge Hub";
    if (section !== "search" && document.activeElement !== qInput) qInput.value = "";
    document.querySelectorAll("#nav a").forEach((n) => (n.dataset.section === section ? n.setAttribute("aria-current", "page") : n.removeAttribute("aria-current")));

    document.getElementById("advisor-fab").hidden = section === "advisor" || !ADV;
    if (section === "advisor") bindAdvisor(params);
    const copy = app.querySelector("[data-copy]");
    if (copy) copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(location.href); copy.textContent = "✓ Copied"; } catch (e) { copy.textContent = "Copy failed"; }
    });
    if (section !== "search") window.scrollTo(0, 0);
  }

  // ---------- chrome ----------
  document.getElementById("brand-name").textContent = C.name || "Knowledge Hub";
  document.getElementById("brand-org").textContent = C.organisation || "";
  document.getElementById("nav").innerHTML = [
    ["advisor", "Advisor"], ["systems", "Systems"], ["guidance", "Standards"], ["projects", "Projects"],
  ].concat(DATA.help ? [["help", "How to use"]] : []).map(([s, l]) => `<a href="#/${s}" data-section="${s}">${l}</a>`).join("");
  const repoLink = C.repo ? ` · <a href="${esc(C.repo)}" target="_blank" rel="noopener">Content source &amp; change history</a>` : "";
  document.getElementById("foot").innerHTML = `
    <p>${esc(C.notice || "")}</p>
    <p>${ITEMS.length} pages · last published ${esc(DATA.built)}${DATA.help ? ' · <a href="#/help">How to use this hub</a>' : ""}${repoLink}</p>`;

  qInput.addEventListener("input", () => {
    const v = qInput.value.trim();
    const target = v ? `#/search?q=${encodeURIComponent(v)}` : "#/";
    if (location.hash.startsWith("#/search")) { history.replaceState(null, "", target); render(); }
    else location.hash = target;
  });
  qInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = search(qInput.value)[0];
      if (first) { location.hash = href(first.it); qInput.blur(); }
    } else if (e.key === "Escape") { qInput.value = ""; qInput.blur(); }
  });
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); qInput.focus(); qInput.select(); }
  });

  const root = document.documentElement;
  try { const t = localStorage.getItem("hub-theme"); if (t) root.dataset.theme = t; } catch (e) { /* storage unavailable */ }
  document.getElementById("theme").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("hub-theme", root.dataset.theme); } catch (e) { /* ignore */ }
  });

  window.addEventListener("hashchange", render);
  render();
})();
