/* Scaffold Advisor engine - pure logic, no page/DOM code, so it can be unit-tested.
 *
 * Knowledge comes from the hub content, not from this file:
 *   content/advisor.json      -> factors (what to listen for) and follow-up questions
 *   content/systems/*.md      -> role, requires, suits, avoid (when each system fits)
 *
 * Works in the browser (window.HubAdvisor) and in Node (module.exports) for tests.
 */
(function (root) {
  "use strict";

  const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };
  const NEGATION = /(?:^|\s)(?:no|not|without|isn't|aren't|won't|don't|doesn't|never|nobody)\s+(?:\S+\s+)?$/;
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function create(data) {
    const advisor = data.advisor || { factors: [], groups: [] };
    const factors = advisor.factors;
    const groups = advisor.groups;
    const F = Object.fromEntries(factors.map((f) => [f.id, f]));
    const items = data.items;
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    const systems = items.filter((i) => i.type === "system" && i.meta.role);
    const projects = items.filter((i) => i.type === "project");
    const weight = (id) => (F[id] && typeof F[id].weight === "number" ? F[id].weight : 1);
    const list = (v) => (Array.isArray(v) ? v : []);

    // Pre-compile keyword patterns: whole words/phrases, optional plural "s".
    const patterns = factors.map((f) => ({
      id: f.id,
      res: list(f.keywords).map((k) => new RegExp("(^|[^\\p{L}\\p{N}])" + reEsc(k.toLowerCase()) + "s?(?=$|[^\\p{L}\\p{N}])", "gu")),
    }));

    function heightFrom(text) {
      let m = text.match(/(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)(?![\p{L}\p{N}])/u);
      if (m) return parseFloat(m[1]);
      m = text.match(/(\d+|[a-z]+)[\s-]*(?:storeys?|story|stories|floors?)(?![\p{L}])/u);
      if (m) {
        const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : WORD_NUMBERS[m[1]];
        if (n) return n * 3;
      }
      return null;
    }

    /** Read a free-text description and return the factor ids it mentions. */
    function extract(text) {
      const t = String(text || "").toLowerCase().replace(/[’‘]/g, "'");
      const found = new Set();
      for (const p of patterns) {
        for (const re of p.res) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(t))) {
            const before = t.slice(Math.max(0, m.index - 25), m.index + m[1].length);
            if (!NEGATION.test(before)) { found.add(p.id); break; }
          }
          if (found.has(p.id)) break;
        }
      }
      const h = heightFrom(t);
      if (h) {
        ["low", "mid", "high"].forEach((x) => found.delete(x));
        found.add(h < 10 ? "low" : h <= 30 ? "mid" : "high");
      } else if (found.has("high")) {
        found.delete("low"); found.delete("mid");
      }
      return { factors: found, height: h };
    }

    /** Next follow-up question worth asking, or null when we know enough. */
    function nextQuestion(present, asked) {
      const has = (id) => present.has(id);
      for (const g of groups) {
        if (!g.ask || asked.has(g.id)) continue;
        if (list(g.options).some(has)) continue;
        if (g.ask_if && !g.ask_if.some(has)) continue;
        if (g.ask_unless && g.ask_unless.some(has)) continue;
        return {
          id: g.id,
          question: g.question,
          exclusive: !!g.exclusive,
          options: list(g.options).map((fid) => ({ factor: fid, label: (g.labels && g.labels[fid]) || (F[fid] ? F[fid].label : fid) })),
        };
      }
      return null;
    }

    /** Factor ids in the same exclusive question as fid (e.g. low/mid/high). */
    function rivals(fid) {
      const g = groups.find((x) => x.exclusive && list(x.options).includes(fid));
      return g ? g.options.filter((o) => o !== fid) : [];
    }

    function recommend(present) {
      const has = (id) => present.has(id);
      const ranked = [];
      const unsuitable = [];

      for (const s of systems.filter((x) => x.meta.role === "structure")) {
        const req = list(s.meta.requires);
        if (req.length && !req.some(has)) continue;
        const suits = list(s.meta.suits).filter(has);
        const avoid = list(s.meta.avoid).filter(has);
        const score = suits.reduce((a, id) => a + weight(id), 0);
        if (avoid.length) {
          if (score > 0) unsuitable.push({ item: s, because: avoid });
          continue;
        }
        if (score > 0) ranked.push({ item: s, score, reasons: suits });
      }
      ranked.sort((a, b) => b.score - a.score || b.reasons.length - a.reasons.length || a.item.title.localeCompare(b.item.title));

      const primary = ranked[0] || null;
      const alternatives = primary ? ranked.slice(1).filter((r) => r.score >= primary.score * 0.4).slice(0, 3) : [];

      const addons = [];
      for (const s of systems.filter((x) => x.meta.role === "addon")) {
        const req = list(s.meta.requires);
        if (!req.some(has) || list(s.meta.avoid).some(has)) continue;
        const reasons = [...new Set([...req.filter(has), ...list(s.meta.suits).filter(has)])];
        addons.push({ item: s, reasons, level: reasons.length >= 2 ? "likely" : "consider" });
      }
      addons.sort((a, b) => (a.level === b.level ? b.reasons.length - a.reasons.length : a.level === "likely" ? -1 : 1));

      // Standards to read first: the chosen systems' guidance, plus situation-specific ones.
      const chosen = [primary && primary.item, ...addons.filter((a) => a.level === "likely").map((a) => a.item)].filter(Boolean);
      const gIds = [];
      chosen.forEach((s) => list(s.meta.guidance).forEach((g) => gIds.push(g)));
      if (has("public_below")) gIds.unshift("highway-licence");
      const bespoke = chosen.some((s) => s.meta.design_basis === "Bespoke design required");
      if (bespoke) gIds.unshift("design-brief-checklist");
      const guidance = [...new Set(gIds)].map((id) => byId[id]).filter(Boolean).slice(0, 6);

      // Similar past jobs: shared systems first, then shared situation keywords.
      const considered = new Set([primary, ...alternatives].filter(Boolean).map((r) => r.item.id).concat(addons.map((a) => a.item.id)));
      const keywords = [...present].flatMap((id) => list(F[id] && F[id].keywords));
      const similar = projects.map((p) => {
        const sys = list(p.meta.systems);
        let score = 0;
        if (primary && sys.includes(primary.item.id)) score += 4;
        score += sys.filter((x) => considered.has(x)).length;
        const hay = (p.title + " " + p.summary + " " + list(p.meta.tags).join(" ")).toLowerCase();
        score += Math.min(3, keywords.filter((k) => hay.includes(k.toLowerCase())).length);
        return { item: p, score };
      }).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.item);

      return {
        primary, alternatives, addons, unsuitable, guidance, similar, bespoke,
        confidence: !primary ? "none" : primary.score >= 5 ? "good" : "low",
      };
    }

    return {
      extract, nextQuestion, recommend, rivals,
      factor: (id) => F[id],
      reason: (id) => (F[id] ? F[id].reason : id),
      label: (id) => (F[id] ? F[id].label : id),
      allFactors: factors,
    };
  }

  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HubAdvisor = api;
})(typeof window !== "undefined" ? window : this);
