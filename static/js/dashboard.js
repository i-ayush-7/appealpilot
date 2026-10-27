"use strict";
/* Dashboard: KPIs, case table with filters and search, deadlines, outcomes. */

const FILTERS = [["all", "All"], ["draft", "Drafting"], ["ready", "Ready"], ["needs", "Needs info"], ["sent", "Submitted"], ["won", "Won"]];
let filter = "all", query = "";

const TONE = { medical_necessity: "ultra", out_of_network: "super", prior_authorization: "nano", experimental_investigational: "local" };

function caseRow(c, i) {
  const left = daysUntil(c.deadline);
  const tone = TONE[c.category] || "local";
  const win = c.window || 180;
  const dl = c.status === "won" ? `<span class="l-s c-brand6">Overturned</span>`
    : left == null ? `<span class="l-s c-muted">—</span>`
    : `<span class="l-s" style="color:${left < 0 ? "var(--ultra)" : "var(--ink)"}">${left < 0 ? "Past due" : `${left} days`}</span>
       <div class="bar" style="--c:var(--${left <= 21 ? "ultra" : left <= 60 ? "super" : "nano"})"><i data-w="${Math.max(3, Math.min(100, (left / win) * 100))}%"></i></div>`;
  const score = c.score != null ? `<span class="score sc-${scoreTone(c.score)}">${c.score}</span>` : `<span class="mono c-muted">—</span>`;
  return `<div class="crow" data-id="${esc(c.id)}" tabindex="0" role="link" aria-label="Open ${esc(c.title)}" style="animation:rise .5s ${0.05 * i}s cubic-bezier(.2,.8,.2,1) both">
    <div class="case-id"><span class="tile bg-${tone === "local" ? "local" : tone}">${esc((c.insurer || "?")[0])}</span>
      <div class="t"><div class="l-m">${esc(c.title)} ${c.sample ? '<span class="tag">Sample</span>' : ""}</div><div class="b-s c-muted">${esc(c.insurer || "")}${c.claim ? " · " + esc(c.claim) : ""}</div></div></div>
    <div>${statusPill(c.status)}</div>
    <div class="dl">${dl}</div>
    <div>${score}</div>
    <div class="mono-m">${money(c.amount)}</div>
    <div class="go">${ic("arrow")}</div>
  </div>`;
}

function render() {
  const all = Store.all();
  // KPIs
  const active = all.filter((c) => !["won"].includes(c.status));
  const stake = active.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const next = active.map((c) => ({ c, d: daysUntil(c.deadline) })).filter((x) => x.d != null && x.d >= 0).sort((a, b) => a.d - b.d)[0];
  const scored = all.filter((c) => c.score != null);
  const avg = scored.length ? scored.reduce((s, c) => s + c.score, 0) / scored.length : null;
  const ready = all.filter((c) => c.status === "ready").length;
  const lifts = scored.filter((c) => c.firstScore != null).map((c) => c.score - c.firstScore);
  const K = [
    ["folder", "Active appeals", active.length, (v) => Math.round(v), ready ? `${ready} ready to send` : "None ready yet", "brand-tint"],
    ["dollar", "Amount at stake", stake, (v) => money(v), `across ${active.length} claim${active.length === 1 ? "" : "s"}`, "super"],
    ["clock", "Next deadline", next ? next.d : null, (v) => `${Math.round(v)} days`, next ? `${next.c.insurer} · ${next.c.title}` : "No open deadlines", "ultra"],
    ["gauge", "Avg. win likelihood", avg, (v) => Math.round(v), lifts.length ? signed(Math.round(lifts.reduce((a, b) => a + b, 0) / lifts.length)) + " pts after revision" : scored.length ? "from Ultra’s review" : "Run a case to see it", "nano"],
  ];
  $("#kpis").innerHTML = K.map(([i, k, , , sub, tone], n) => `<div class="card kpi"><div class="kpi-top"><span class="tile bg-${tone === "brand-tint" ? "brand-tint" : tone}" style="width:32px;height:32px;border-radius:9px">${ic(i)}</span><span class="l-s c-ink2">${k}</span></div>
      <span class="v" data-k="${n}">—</span><span class="b-s c-muted">${esc(sub)}</span></div>`).join("");
  K.forEach(([, , v, fmt], n) => { const el = $(`[data-k="${n}"]`); if (v == null) el.textContent = "—"; else tween(el, v, { dur: 1200, fmt, from: 0 }); });

  // filters
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, k === "all" ? all.length : all.filter((c) => c.status === k || (k === "draft" && c.status === "running")).length]));
  $("#filters").innerHTML = FILTERS.filter(([k]) => k === "all" || counts[k]).map(([k, l]) => `<button class="ftab ${k === filter ? "on" : ""}" data-f="${k}" role="tab" aria-selected="${k === filter}">${l} <b>${counts[k]}</b></button>`).join("");

  // rows
  const q = query.toLowerCase();
  const rows = all
    .filter((c) => filter === "all" || c.status === filter || (filter === "draft" && c.status === "running"))
    .filter((c) => !q || [c.title, c.insurer, c.claim].some((s) => (s || "").toLowerCase().includes(q)))
    .sort((a, b) => (daysUntil(a.deadline) ?? 9e9) - (daysUntil(b.deadline) ?? 9e9));
  $("#rows").innerHTML = rows.length ? rows.map(caseRow).join("") : `<div class="empty"><p class="h-s" style="color:var(--ink)">No cases here</p><p class="b-s">Start a new appeal or clear the filter.</p></div>`;
  requestAnimationFrame(() => setTimeout(() => $$("#rows .bar > i[data-w]").forEach((b) => (b.style.width = b.dataset.w)), 150));

  // tip
  const readyCase = all.find((c) => c.status === "ready");
  const unrun = all.find((c) => c.status === "draft");
  $("#tip").innerHTML = readyCase ? `${ic("spark")}<span><b>${esc(readyCase.title)}</b> is ready. Add a letter of medical necessity from your doctor before you mail it.</span>`
    : unrun ? `${ic("spark")}<span>Open <b>${esc(unrun.title)}</b> to watch Nemotron Nano, Super and Ultra build the appeal.</span>`
    : `${ic("spark")}<span>Tip: you can mark a case as submitted, then as overturned when you win.</span>`;

  // deadlines
  const ups = active.map((c) => ({ c, d: daysUntil(c.deadline) })).filter((x) => x.d != null && x.d >= 0).sort((a, b) => a.d - b.d).slice(0, 3);
  $("#deadlines").innerHTML = ups.length ? ups.map(({ c, d }) => {
    const tone = d <= 21 ? "ultra" : d <= 60 ? "super" : "brand-tint";
    const dt = new Date(c.deadline + "T00:00:00");
    return `<a class="dl-item" href="/app/case?id=${encodeURIComponent(c.id)}"><span class="cal bg-${tone}"><span class="caps">${dt.toLocaleDateString(undefined, { month: "short" })}</span><b>${dt.getDate()}</b></span>
      <span><span class="l-m" style="display:block">${esc(c.insurer)} · ${esc(c.title)}</span><span class="b-s c-muted">${d} days left${c.category === "prior_authorization" && d < 45 ? " · ask for expedited" : ""}</span></span></a>`;
  }).join("") : `<p class="b-s c-muted" style="margin:0">No open deadlines.</p>`;

  // recovered
  const won = all.filter((c) => c.status === "won");
  const rec = won.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  $("#recovered").innerHTML = won.length
    ? `<span class="caps" style="color:var(--night-text)">Recovered so far</span><span class="v" id="recV">$0</span><p class="b-s">${won.length} denial${won.length > 1 ? "s" : ""} overturned. Model costs for those appeals: about $${(0.034 * won.length).toFixed(2)}.</p>`
    : `<span class="caps" style="color:var(--night-text)">Recovered so far</span><span class="v">$0</span><p class="b-s">When an insurer reverses a denial, open the case and mark it overturned. Wins show up here.</p>`;
  if (won.length) tween($("#recV"), rec, { dur: 1400, fmt: (v) => money(v), from: 0 });
}

function bind() {
  $("#filters").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) { filter = b.dataset.f; render(); } });
  $("#search").addEventListener("input", (e) => { query = e.target.value; render(); });
  addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); $("#search").focus(); } });
  const open = (row) => (location.href = `/app/case?id=${encodeURIComponent(row.dataset.id)}`);
  $("#rows").addEventListener("click", (e) => { const r = e.target.closest(".crow"); if (r) open(r); });
  $("#rows").addEventListener("keydown", (e) => { const r = e.target.closest(".crow"); if (r && e.key === "Enter") open(r); });
}

(async function init() {
  const now = new Date();
  $("#today").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const h = now.getHours();
  $("#hello").textContent = h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
  await ensureSamples();
  renderShell("Dashboard");
  bind();
  render();
  if (location.hash === "#cases") setTimeout(() => $("#cases").scrollIntoView({ behavior: "smooth" }), 300);
})();
