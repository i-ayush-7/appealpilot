"use strict";
/* Case workspace: runs (or replays) the Nemotron pipeline for one case and presents the appeal. */

const STAGES = [
  { id: "intake", name: "Read denial", tier: "nano", say: "Nemotron Nano is reading the denial letter…" },
  { id: "retrieve", name: "Find clauses", tier: "local", say: "Searching your policy for the clauses that matter…" },
  { id: "evidence", name: "Build case", tier: "super", say: "Nemotron Super is building arguments from your policy and records…" },
  { id: "draft", name: "Draft", tier: "super", say: "Nemotron Super is drafting the appeal letter…" },
  { id: "review", name: "Review", tier: "ultra", say: "Nemotron Ultra is reviewing it the way the insurer’s medical reviewer would…" },
  { id: "revise", name: "Revise", tier: "super", say: "Nemotron Super is fixing every weakness the reviewer found…" },
  { id: "rescore", name: "Re-score", tier: "ultra", say: "Nemotron Ultra is re-scoring the revised letter…" },
];
const TC = { nano: "var(--nano)", super: "var(--super)", ultra: "var(--ultra)", local: "var(--local)" };
const TABS = [["letter", "Letter"], ["evidence", "Evidence"], ["review", "Insurer review"], ["clauses", "Policy clauses"], ["routing", "Model routing"]];

const params = new URLSearchParams(location.search);
let C = null;                 // the case record
let R = null;                 // result being built / loaded
let tab = "letter", version = "final", showDiff = true, editing = false, running = false;
const stepState = {};

/* =================== header, pipe, tabs =================== */
function renderHeader() {
  document.title = `${C.title} · AppealPilot`;
  $("#title").textContent = `${C.title} appeal`;
  $("#crumbIns").textContent = C.insurer || "Case";
  $("#statusPill").innerHTML = statusPill(running ? "running" : C.status) + (C.sample ? ' <span class="tag" style="margin-left:6px">Sample</span>' : "");
  const A = $("#actions");
  if (running) A.innerHTML = `<button class="btn btn-secondary" disabled>Building…</button>`;
  else if (!R) A.innerHTML = `<button class="btn btn-primary" id="runBtn">${ic("spark")}Build this appeal<span class="sheen"></span></button>`;
  else {
    const main = C.status === "sent" ? `<button class="btn btn-primary" id="wonBtn">${ic("trophy")}Mark overturned</button>`
      : C.status === "won" ? `<span class="status s-won" style="padding:10px 14px">Overturned</span>`
      : `<button class="btn btn-primary" id="sentBtn">${ic("send")}Mark as sent</button>`;
    A.innerHTML = `<button class="icon-btn" id="rerunBtn" title="Rebuild with the models" aria-label="Rebuild appeal">${ic("redo")}</button><button class="btn btn-secondary" id="pdfBtn">${ic("download")}Download PDF</button>${main}`;
  }
  $("#runBtn")?.addEventListener("click", run);
  $("#rerunBtn")?.addEventListener("click", () => { if (confirm("Rebuild this appeal? This makes new model calls (about $0.03) unless the inputs are unchanged and cached.")) run(); });
  $("#pdfBtn")?.addEventListener("click", printLetter);
  $("#sentBtn")?.addEventListener("click", () => setStatus("sent", "Marked as sent. Good luck — we’ll keep the deadline in view."));
  $("#wonBtn")?.addEventListener("click", () => { setStatus("won", "Overturned! That’s the whole point."); confetti(); });
}

function setStatus(s, msg) { C.status = s; Store.save(C); renderHeader(); toast(msg); }

function renderPipe() {
  $("#pipe").innerHTML = STAGES.map((s) => `<div class="pst ${stepState[s.id]?.st || ""}" id="p-${s.id}" style="--tc:${TC[s.tier]}">
      <span class="dot">${ic("check")}</span><span style="min-width:0"><span class="nm" style="display:block">${s.name}</span><span class="mt">${stepState[s.id]?.meta || s.tier}</span></span></div>`).join("")
    + `<div class="pipe-sum"><span class="mono-m" id="sumCost">${R?.totals ? usd(R.totals.cost) + " · " + secs(R.totals.ms) : "—"}</span><span class="b-s c-brand6" id="sumSave">${R?.totals ? `${Math.round(R.totals.savings)}% less than all-Ultra` : "Nemotron on Nebius"}</span></div>`;
}
function setStep(id, st, meta) {
  stepState[id] = { ...(stepState[id] || {}), st, ...(meta != null ? { meta } : {}) };
  const el = $(`#p-${id}`);
  if (!el) return;
  el.className = `pst ${st}`;
  if (meta != null) $(".mt", el).textContent = meta;
}
function status(text, tier, idle = false) {
  const l = $("#statusLine");
  l.classList.toggle("idle", idle);
  l.style.setProperty("--sc", TC[tier] || "var(--brand-600)");
  $("#statusText").textContent = text;
}

function renderTabs() {
  const cnt = { evidence: R?.evidence?.arguments?.length, review: (R?.rescore || R?.review)?.score, clauses: R?.clauses?.length };
  $("#tabs").innerHTML = TABS.map(([k, l]) => `<button class="tab ${k === tab ? "on" : ""}" data-t="${k}" role="tab" aria-selected="${k === tab}">${l}${cnt[k] != null ? `<span class="cnt">${cnt[k]}</span>` : ""}</button>`).join("")
    + `<span class="tab-ink" id="ink"></span>`
    + (tab === "letter" && R?.final && R.final !== R.draft ? `<div class="tabs-tools"><label class="switch"><input type="checkbox" id="diffT" ${showDiff ? "checked" : ""} /><span></span>Show changes</label>
        <div class="seg"><button data-v="draft" class="${version === "draft" ? "on" : ""}">First draft</button><button data-v="final" class="${version === "final" ? "on" : ""}">Revised</button></div></div>` : "");
  moveInk();
  $("#diffT")?.addEventListener("change", (e) => { showDiff = e.target.checked; $("#letter")?.classList.toggle("plain", !showDiff); });
  $$(".seg button").forEach((b) => b.addEventListener("click", () => { version = b.dataset.v; renderTabs(); renderPanel(false); }));
}
function moveInk() {
  const on = $(".tab.on"), ink = $("#ink");
  if (!on || !ink) return;
  ink.style.left = on.offsetLeft + "px";
  ink.style.width = on.offsetWidth + "px";
}

/* =================== panels =================== */
function renderPanel(animate = true) {
  const P = $("#panel");
  P.style.animation = "none"; void P.offsetWidth; P.style.animation = "";
  if (!R && !running) {
    P.innerHTML = `<div class="card run-cta"><span class="tile bg-brand-tint" style="width:56px;height:56px;border-radius:16px">${ic("spark")}</span>
      <h2 class="d-m">Build this appeal</h2><p class="b-m c-ink2" style="margin:0;max-width:460px">Three Nemotron models will read the denial, find the clauses your insurer must follow, draft the letter and attack it before you send it. About 40 seconds.</p>
      <button class="btn btn-primary btn-lg" id="runBtn2">Build this appeal ${ic("arrow", "arrow")}<span class="sheen"></span></button></div>`;
    $("#runBtn2").addEventListener("click", run);
    return;
  }
  if (tab === "letter") return renderLetterTab(animate);
  if (tab === "evidence") return renderEvidenceTab();
  if (tab === "review") return renderReviewTab();
  if (tab === "clauses") return renderClausesTab();
  if (tab === "routing") return renderRoutingTab();
}

/* ---------- letter ---------- */
function currentLetter() { return editing ? $("#editArea")?.value || "" : (version === "draft" ? R?.draft : R?.final || R?.draft) || ""; }

function renderLetterTab() {
  const text = currentLetter();
  $("#panel").innerHTML = `<article class="paper" id="paper">
      <div class="stamp ${R?.ready ? "go" : ""}" id="stamp">Appeal ready</div>
      <div class="sheet"><div class="tierbar"></div>
        ${text ? `<div class="letter ${showDiff ? "" : "plain"}" id="letter"></div>` : `<div class="ink-skel" id="skel">${"<i></i>".repeat(12)}</div><div class="letter" id="letter" hidden></div>`}
        <textarea class="edit-area" id="editArea" hidden aria-label="Edit letter"></textarea>
        <div class="scan" id="scan"></div></div>
      <aside class="margin" id="margin" aria-label="Reviewer notes"><span class="caps c-ultra">Reviewer notes</span></aside>
      <footer class="paper-foot"><span id="phNote"></span><span class="letter-tools">
        <button class="icon-btn" id="editBtn" title="Edit" aria-label="Edit letter" style="width:32px;height:32px">${ic("edit")}</button>
        <button class="icon-btn" id="copyBtn" title="Copy" aria-label="Copy letter" style="width:32px;height:32px">${ic("copy")}</button>
        <button class="icon-btn" id="dlBtn" title="Download .txt" aria-label="Download letter" style="width:32px;height:32px">${ic("download")}</button>
        <button class="icon-btn" id="printBtn" title="Print / PDF" aria-label="Print letter" style="width:32px;height:32px">${ic("print")}</button></span></footer>
    </article>`;
  if (text) { $("#letter").innerHTML = letterHTML(text, version === "final" && R.draft !== R.final ? R.draft : null, false); letterMeta(text); }
  renderNotes(false);
  $("#editBtn").addEventListener("click", toggleEdit);
  $("#copyBtn").addEventListener("click", async () => { try { await navigator.clipboard.writeText(currentLetter()); toast("Letter copied"); } catch { toast("Copy blocked — use Edit, then select all."); } });
  $("#dlBtn").addEventListener("click", () => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([currentLetter()], { type: "text/plain" })), download: `appeal-${(C.insurer || "letter").replace(/\W+/g, "-").toLowerCase()}.txt` }); a.click(); });
  $("#printBtn").addEventListener("click", printLetter);
}

function toggleEdit() {
  editing = !editing;
  const ta = $("#editArea"), L = $("#letter");
  $("#editBtn").classList.toggle("on", editing);
  if (editing) { ta.value = (version === "draft" ? R.draft : R.final) || ""; ta.hidden = false; L.hidden = true; ta.focus(); }
  else {
    const v = ta.value;
    if (version === "draft") R.draft = v; else R.final = v;
    if (R.draft && !R.final) R.final = v;
    ta.hidden = true; L.hidden = false; L.innerHTML = letterHTML(v, null, false); letterMeta(v);
    saveResult(); toast("Edits saved");
  }
}

function printLetter() {
  let p = $("#printLetter");
  if (!p) { p = document.createElement("div"); p.id = "printLetter"; document.body.appendChild(p); }
  p.textContent = currentLetter();
  print();
}

function letterMeta(text) {
  const n = (text.match(/\[[^\]\n]{1,80}\]/g) || []).length;
  const el = $("#phNote");
  if (el) el.textContent = `${text.split(/\s+/).filter(Boolean).length} words · ${n ? `${n} [placeholder${n > 1 ? "s" : ""}] to fill in` : "no placeholders"}`;
}

function wordDiff(oldText, newText) {
  const a = oldText.split(/\s+/).filter(Boolean), toks = newText.split(/(\s+)/), b = toks.filter((t) => t && !/^\s+$/.test(t));
  const n = a.length, m = b.length;
  if (!n || n * m > 2_500_000) return null;
  const W = m + 1, L = new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = a[i] === b[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
  const ins = new Array(m).fill(false);
  let i = 0, j = 0;
  while (j < m) { if (i < n && a[i] === b[j]) { i++; j++; } else if (i < n && L[(i + 1) * W + j] >= L[i * W + j + 1]) i++; else { ins[j] = true; j++; } }
  const segs = []; let w = 0;
  for (const t of toks) {
    if (!t) continue;
    const ws = /^\s+$/.test(t), on = ws ? null : ins[w++], last = segs[segs.length - 1];
    if (ws) { if (last) last.text += t; else segs.push({ text: t, ins: false }); }
    else if (last && last.ins === on && !/\n\s*\n/.test(last.text.slice(-4))) last.text += t;
    else segs.push({ text: t, ins: on });
  }
  for (let k = segs.length - 2; k >= 1; k--) {
    const [p, c, nx] = [segs[k - 1], segs[k], segs[k + 1]];
    if (p.ins && nx.ins && !c.ins && c.text.trim().length <= 4 && !c.text.includes("\n")) { p.text += c.text + nx.text; segs.splice(k, 2); }
  }
  return segs;
}

function letterHTML(text, against, animate) {
  const ph = (s) => esc(s).replace(/\[[^\]\n]{1,80}\]/g, (m) => `<span class="ph">${m}</span>`);
  const segs = against ? wordDiff(against, text) : null;
  if (!segs) return ph(text);
  let k = 0;
  return segs.map((s) => {
    if (!s.ins) return ph(s.text);
    const trail = s.text.match(/\s+$/)?.[0] || "", body = trail ? s.text.slice(0, -trail.length) : s.text;
    return `<mark style="--d:${animate ? Math.min(1.7 + k++ * 0.05, 3.4).toFixed(2) : 0}s">${ph(body)}</mark>${esc(trail)}`;
  }).join("");
}

async function typeLetter(text) {
  const L = $("#letter"); if (!L) return;
  $("#skel")?.remove(); L.hidden = false; letterMeta(text);
  if (REDUCED || document.hidden) { L.innerHTML = letterHTML(text); return; }
  const dur = Math.min(2600, 400 + text.length * 0.5), t0 = performance.now();
  await new Promise((done) => {
    let fin = false; const end = () => { if (!fin) { fin = true; done(); } };
    const step = (t) => { if (fin) return; const p = Math.min(1, (t - t0) / dur); L.innerHTML = esc(text.slice(0, Math.floor(text.length * p * (2 - p)))) + '<span class="caret"></span>'; p < 1 ? requestAnimationFrame(step) : end(); };
    requestAnimationFrame(step); setTimeout(end, dur + 600);
  });
  L.innerHTML = letterHTML(text);
}

function rewriteLetter(newText, oldText) {
  const L = $("#letter"), scan = $("#scan"); if (!L) return;
  $("#skel")?.remove(); L.hidden = false;
  L.classList.remove("rewrite"); L.innerHTML = letterHTML(newText, oldText, true); letterMeta(newText);
  if (REDUCED) return;
  void L.offsetWidth; L.classList.add("rewrite");
  scan.style.setProperty("--h", `${L.parentElement.offsetHeight}px`);
  scan.classList.remove("go"); void scan.offsetWidth; scan.classList.add("go");
}

function notesFrom(review) {
  return [...(review?.factual_errors || []).map((f) => ({ issue: f, severity: "high" })), ...(review?.weaknesses || [])].slice(0, 5);
}
function renderNotes(animate = true) {
  const m = $("#margin"); if (!m) return;
  m.innerHTML = `<span class="caps c-ultra">Reviewer notes</span>`;
  if (!R?.review) { m.insertAdjacentHTML("beforeend", `<p class="margin-empty">${running ? "Waiting for Ultra’s review…" : "No review yet."}</p>`); return; }
  const first = notesFrom(R.review), fixed = !!R.rescore;
  const add = (w, i, isFixed, delay) => {
    const words = String(w.issue).split(/\s+/), short = words.length > 15 ? words.slice(0, 15).join(" ") + "…" : w.issue;
    m.insertAdjacentHTML("beforeend", `<div class="note ${isFixed ? "fixed" : ""}" title="${esc(w.issue + (w.fix ? "\n\nFix: " + w.fix : ""))}" style="--d:${animate ? delay : 0}s;--rot:${(i % 2 ? 1 : -1) * (0.6 + (i % 3) * 0.5)}deg">${w.severity === "high" && !isFixed ? "! " : ""}<span class="txt">${esc(short)}</span><span class="fx">✓ fixed in revision</span></div>`);
  };
  if (!first.length) m.insertAdjacentHTML("beforeend", `<p class="margin-empty">No objections. Nice.</p>`);
  first.forEach((w, i) => add(w, i, fixed, i * 0.35));
  if (fixed) (R.rescore.weaknesses || []).filter((w) => w.severity !== "low").slice(0, 2).forEach((w, i) => add(w, first.length + i, false, (first.length + i) * 0.35));
}
async function markNotesFixed() {
  const notes = $$("#margin .note");
  for (const n of notes) { n.classList.add("fixed"); await sleep(REDUCED ? 0 : 260); }
  (R.rescore.weaknesses || []).filter((w) => w.severity !== "low").slice(0, 2).forEach((w, i) => {
    const words = String(w.issue).split(/\s+/), short = words.length > 15 ? words.slice(0, 15).join(" ") + "…" : w.issue;
    $("#margin")?.insertAdjacentHTML("beforeend", `<div class="note" style="--d:${0.2 + i * 0.35}s;--rot:${i % 2 ? 1.2 : -1.2}deg">${w.severity === "high" ? "! " : ""}<span class="txt">${esc(short)}</span><span class="fx"></span></div>`);
  });
}

/* ---------- evidence / review / clauses / routing ---------- */
function renderEvidenceTab() {
  const ev = R?.evidence;
  if (!ev) { $("#panel").innerHTML = `<div class="card card-pad"><div class="ink-skel">${"<i></i>".repeat(8)}</div></div>`; return; }
  $("#panel").innerHTML = `<div class="card card-pad"><p class="strategy">${esc(ev.strategy || "")}</p>
    <ol class="args">${(ev.arguments || []).map((a, i) => `<li class="card" style="--d:${i * 0.1}s"><div class="arg-top"><p>${esc(a.point)}</p><span class="meter ${esc(a.strength)}" title="${esc(a.strength)}"><i></i><i></i><i></i></span></div>
      <ul class="cites">${(a.support || []).map((s) => `<li>${s.source === "policy" ? `<button class="src policy" data-clause="${esc(s.ref)}">${esc(s.ref)}</button>` : `<span class="src ${esc(s.source)}">${esc(s.source)}</span>`}
        <span>${s.quote ? `<q>${esc(s.quote)}</q>` : ""}${s.source !== "policy" ? `<span class="ref">${esc(s.ref)}</span>` : ""}</span></li>`).join("")}</ul></li>`).join("")}</ol>
    ${(ev.legal_hooks || []).length ? `<div class="laws">${ev.legal_hooks.map((h) => `<div><b>${esc(h.name)}</b>${esc(h.applies_because)}</div>`).join("")}</div>` : ""}</div>`;
  $$("[data-clause]").forEach((b) => b.addEventListener("click", () => { tab = "clauses"; renderTabs(); renderPanel(); setTimeout(() => { const c = document.getElementById("cl-" + b.dataset.clause); if (c) { c.open = true; c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 1500); } }, 80); }));
}

function renderReviewTab() {
  const r1 = R?.review, r2 = R?.rescore;
  if (!r1) { $("#panel").innerHTML = `<div class="card card-pad"><div class="ink-skel">${"<i></i>".repeat(8)}</div></div>`; return; }
  const fin = r2 || r1;
  $("#panel").innerHTML = `<div style="display:flex;flex-direction:column;gap:16px">
    <div class="compare-scores">
      <div><span class="caps c-muted">${r2 ? "First draft" : "Score"}</span><div class="v c-${scoreTone(r1.score)}">${r1.score}</div><span class="b-s c-muted">${esc(r1.verdict === "ready" ? "Ready as written" : "Needed revision")}</span></div>
      ${r2 ? `<div><span class="caps c-muted">After revision</span><div class="v c-${scoreTone(r2.score)}">${r2.score}</div><span class="pill pill-good">▲ ${r2.score - r1.score >= 0 ? "+" : ""}${r2.score - r1.score} pts</span></div>` : `<div><span class="caps c-muted">Revision</span><div class="v c-muted">—</div><span class="b-s c-muted">Not needed: no factual errors or high-severity issues.</span></div>`}
    </div>
    ${fin.insurer_rebuttal ? `<div class="rebut"><span class="caps c-ultra">What their reviewer could still say</span><p>“${esc(fin.insurer_rebuttal)}”</p></div>` : ""}
    ${(fin.strengths || []).length ? `<div class="card card-pad"><h3 class="h-s" style="margin-bottom:12px">Strengths</h3><ul class="checklist">${fin.strengths.map((s, i) => `<li class="have" style="--d:${i * 0.06}s"><span class="bx">${ic("check")}</span>${esc(s)}</li>`).join("")}</ul></div>` : ""}
    <div class="card card-pad"><h3 class="h-s" style="margin-bottom:12px">${r2 ? "Still open" : "Weaknesses"}</h3>${(fin.weaknesses || []).length ? `<ul class="wk">${fin.weaknesses.map((w) => `<li><div class="l-m iss"><span class="sev ${esc(w.severity)}"></span>${esc(w.issue)}</div><div class="fix">${esc(w.fix || "")}</div></li>`).join("")}</ul>` : `<p class="b-s c-muted" style="margin:0">None.</p>`}</div>
    ${r2 && notesFrom(r1).length ? `<div class="card card-pad"><h3 class="h-s" style="margin-bottom:12px">Fixed in revision</h3><ul class="wk">${notesFrom(r1).map((w) => `<li class="done"><div class="l-m iss"><span class="sev ${esc(w.severity || "medium")}"></span>${esc(w.issue)}</div></li>`).join("")}</ul></div>` : ""}
    ${(fin.factual_errors || []).length ? `<div class="err">Check these facts: ${fin.factual_errors.map(esc).join(" · ")}</div>` : ""}
  </div>`;
}

function renderClausesTab() {
  const cl = R?.clauses || [];
  const cited = new Set((R?.evidence?.arguments || []).flatMap((a) => (a.support || []).filter((s) => s.source === "policy").map((s) => s.ref)));
  $("#panel").innerHTML = `<div>${cl.length ? cl.map((c) => { const body = c.title && c.text.startsWith(c.title) ? c.text.slice(c.title.length).trim() : c.text;
    return `<details class="clause" id="cl-${esc(c.id)}" ${cited.has(c.id) ? "open" : ""}><summary><span class="src policy">${esc(c.id)}</span><span class="t">${esc(c.title || c.text.slice(0, 80))}</span>${cited.has(c.id) ? '<span class="cited">cited</span>' : ""}</summary><p>${esc(body)}</p></details>`; }).join("")
    : `<div class="card card-pad b-m c-muted">No policy document was provided. Add your Evidence of Coverage for clause-cited arguments.</div>`}</div>`;
}

function renderRoutingTab() {
  const tr = R?.traces || [];
  const cost = tr.reduce((s, t) => s + t.cost_usd, 0), ultra = tr.reduce((s, t) => s + t.ultra_cost_usd, 0), max = Math.max(...tr.map((t) => t.cost_usd), 1e-9);
  $("#panel").innerHTML = `<div class="card ledger">
    <div class="cmp"><div class="cmp-row"><span>This appeal</span><div class="bar" style="--c:linear-gradient(90deg,var(--nano),var(--super))"><i data-w="${ultra ? (cost / ultra) * 100 : 0}%"></i></div><b>${usd(cost)}</b></div>
      <div class="cmp-row"><span>All on Ultra</span><div class="bar" style="--c:var(--ultra)"><i data-w="${ultra ? 100 : 0}%"></i></div><b>${usd(ultra)}</b></div></div>
    <div class="lg-row h caps"><span>Step</span><span>Model</span><span>Time</span><span>Tokens</span><span>Cost</span></div>
    ${tr.map((t, i) => `<div class="lg-row" style="animation-delay:${i * 0.06}s"><span class="l-m" style="display:flex;gap:8px;align-items:center;text-transform:capitalize"><span class="tier t-${esc(t.tier)}">${esc(t.tier)}</span>${esc(t.stage)}</span>
      <span class="m" title="${esc(t.model)}">${esc(t.model.split("/").pop())}${t.cached ? " · cached" : ""}</span><span class="mono">${secs(t.latency_ms)}</span><span class="mono">${(t.tokens_in + t.tokens_out).toLocaleString()}</span><span class="mono">${usd(t.cost_usd)}</span>
      <div class="bar" style="--c:var(--${esc(t.tier)})"><i data-w="${(t.cost_usd / max) * 100}%"></i></div></div>`).join("")}
    ${!tr.length ? `<p class="b-s c-muted" style="padding:20px;margin:0">Model calls will appear here as they run.</p>` : ""}
  </div>`;
  setTimeout(() => $$("#panel .bar > i[data-w]").forEach((b) => (b.style.width = b.dataset.w)), 60);
}

/* ---------- rail ---------- */
function renderRail() {
  const fin = R?.rescore || R?.review;
  const ev = R?.evidence;
  const left = daysUntil(C.deadline), win = C.window || 180;
  $("#rail").innerHTML = `
    <div class="card gauge-card"><div style="display:flex;align-items:center;justify-content:space-between"><h3 class="h-s">Win likelihood</h3><span class="tier t-ultra">Ultra review</span></div>
      <div class="gauge-wrap" id="gauge">${gaugeSVG(240)}<span class="gauge-num" id="gNum">${fin ? fin.score : "–"}</span></div>
      <div class="gauge-meta"><span id="gLabel">${fin ? (fin.score >= 85 ? "Strong — ready to send" : fin.score >= 70 ? "Promising — needs work" : "Weak as written") : running ? "Waiting for the review" : "Not reviewed yet"}</span>${R?.rescore ? `<span class="pill pill-good">▲ ${R.rescore.score - R.review.score >= 0 ? "+" : ""}${R.rescore.score - R.review.score}</span>` : ""}</div>
      ${fin?.insurer_rebuttal ? `<div class="rebut"><span class="caps c-ultra">What their reviewer could still say</span><p>“${esc(fin.insurer_rebuttal)}”</p></div>` : ""}
    </div>
    <div class="card card-pad"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><h3 class="h-s">Enclose with your letter</h3><span class="mono c-muted">${ev ? `${(ev.checklist || []).filter((c) => c.status === "have").length}/${(ev.checklist || []).length}` : ""}</span></div>
      ${ev ? `<ul class="checklist">${(ev.checklist || []).map((c, i) => `<li class="${c.status === "have" ? "have" : "miss"}" style="--d:${i * 0.06}s"><span class="bx">${c.status === "have" ? ic("check") : "!"}</span><span>${esc(c.item)}<span class="why">${esc(c.why || "")}</span></span></li>`).join("")}</ul>`
        : `<div class="ink-skel">${"<i></i>".repeat(4)}</div>`}</div>
    <div class="card card-pad" style="display:flex;align-items:center;gap:14px">
      <svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="21" fill="none" stroke="#E6E1D6" stroke-width="5"/><circle id="dlArc" cx="26" cy="26" r="21" fill="none" stroke="${left != null && left <= 21 ? "#C2412D" : "#146C4E"}" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 26 26)" style="transition:stroke-dasharray 1.4s cubic-bezier(.2,.8,.2,1)"/></svg>
      <div><div class="h-s">${left == null ? "Check your letter" : left < 0 ? "Past the deadline" : `${left} days to appeal`}</div><div class="b-s c-muted">${C.deadline ? `Internal appeal due ${fmtDate(C.deadline)}` : "Deadline not found in the letter"}</div></div></div>`;
  if (fin) { setGauge($("#gauge"), fin.score); }
  if (left != null) requestAnimationFrame(() => setTimeout(() => $("#dlArc")?.setAttribute("stroke-dasharray", `${Math.max(2, Math.min(100, (left / win) * 100))} 100`), 100));
}

/* =================== running =================== */
function saveResult() { C.result = R; Store.save(C); }

async function handle(ev) {
  if (ev.type === "trace") {
    R.traces.push(ev);
    const cost = R.traces.reduce((s, t) => s + t.cost_usd, 0), ultra = R.traces.reduce((s, t) => s + t.ultra_cost_usd, 0);
    tween($("#sumCost"), cost, { dur: 600, fmt: (v) => usd(v) });
    $("#sumSave").textContent = ultra ? `${Math.round(100 * (1 - cost / ultra))}% less than all-Ultra` : "";
    setStep(ev.stage, stepState[ev.stage]?.st || "run", `${ev.tier} · ${secs(ev.latency_ms)}${ev.cached ? " · cached" : ""}`);
    if (tab === "routing") renderRoutingTab();
    return;
  }
  if (ev.type === "error") throw new Error(ev.message);
  if (ev.type === "done") {
    R.totals = { cost: ev.total_cost_usd, ultra: ev.all_ultra_cost_usd, savings: ev.savings_pct, ms: ev.total_latency_ms, calls: ev.calls };
    if (!R.final) R.final = ev.letter;
    return;
  }
  if (ev.type !== "stage") return;
  const st = STAGES.find((s) => s.id === ev.stage);
  if (ev.status === "running") { setStep(ev.stage, "run"); status(st.say, st.tier); return; }
  if (ev.status === "skipped") { setStep(ev.stage, "skip", "not needed"); return; }
  setStep(ev.stage, "done");
  const d = ev.data;
  if (ev.stage === "intake") {
    R.intake = d;
    if (d.insurer) C.insurer = d.insurer;
    if (d.claim_number) C.claim = d.claim_number;
    if (d.amount_billed != null) C.amount = d.amount_billed;
    if (d.deadline) C.deadline = d.deadline;
    if (d.appeal_window_days) C.window = d.appeal_window_days;
    if (d.category) C.category = d.category;
    renderHeader(); renderRail();
  }
  if (ev.stage === "retrieve") { R.clauses = d.clauses; setStep("retrieve", "done", `${d.clauses.length} clauses`); renderTabs(); }
  if (ev.stage === "evidence") { R.evidence = d; renderTabs(); renderRail(); if (tab === "evidence") renderPanel(); }
  if (ev.stage === "draft") { R.draft = d.letter; R.final = d.letter; if (tab === "letter") await typeLetter(d.letter); }
  if (ev.stage === "review") {
    R.review = d; renderRail(); renderTabs();
    if (tab === "letter") renderNotes(true);
    if (tab === "review") renderPanel();
  }
  if (ev.stage === "revise") {
    R.final = d.letter; version = "final"; renderTabs();
    if (tab === "letter") { $("#margin")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); rewriteLetter(d.letter, R.draft); }
  }
  if (ev.stage === "rescore") {
    R.rescore = d; renderRail(); renderTabs();
    if (tab === "letter") await markNotesFixed();
    if (tab === "review") renderPanel();
  }
}

async function run() {
  if (running) return;
  running = true; editing = false; version = "final";
  R = { traces: [] };
  STAGES.forEach((s) => (stepState[s.id] = { st: "", meta: s.tier }));
  $("#errorBox").hidden = true;
  C.status = "draft"; renderHeader(); renderPipe(); renderTabs(); renderRail();
  tab = "letter"; renderPanel(); renderTabs();
  status("Connecting to Nebius Token Factory…", "nano");
  try {
    let inputs = C.inputs;
    if (C.sample) { const s = await (await fetch(`/api/samples/${encodeURIComponent(C.sample)}`)).json(); inputs = { denial: s.denial, policy: s.policy, records: s.records, notes: s.notes }; }
    if (!inputs?.denial) throw new Error("This case has no denial letter. Start a new appeal instead.");
    await streamPost("/api/appeal", inputs, handle);
    if (!R.review) throw new Error("The run ended early. Please try again.");
    const fin = R.rescore || R.review;
    R.ready = fin.score >= 85 && !(fin.factual_errors || []).length;
    C.status = R.ready ? "ready" : "needs";
    C.score = fin.score; C.firstScore = R.review.score;
    saveResult();
    running = false;
    renderHeader();
    status(`Appeal ready · ${R.totals?.calls ?? R.traces.length} Nemotron calls · ${usd(R.totals?.cost)} · ${secs(R.totals?.ms || 0)}`, "nano", true);
    if (R.ready && tab === "letter") { await sleep(REDUCED ? 0 : 500); $("#stamp")?.classList.add("go"); }
    $("#pipe .pipe-sum").animate?.([{ background: "#D3E8DC" }, { background: "var(--brand-tint)" }], { duration: 900 });
  } catch (e) {
    running = false;
    $("#errorBox").textContent = e.message; $("#errorBox").hidden = false;
    $$(".pst.run").forEach((p) => (p.className = "pst err"));
    status("Something went wrong. Details above.", "ultra", true);
    if (!R.review) { R = C.result || null; }
    renderHeader();
  }
}

/* ---------- confetti for wins ---------- */
function confetti() {
  if (REDUCED) return;
  const colors = ["#B8E04A", "#146C4E", "#B7771A", "#C2412D", "#0E3B2E"];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement("i");
    const x = (Math.random() - 0.5) * 900, y = -(200 + Math.random() * 400), r = Math.random() * 720;
    p.style.cssText = `position:fixed;z-index:200;left:50%;top:40%;width:${6 + Math.random() * 6}px;height:${8 + Math.random() * 8}px;background:${colors[i % 5]};border-radius:2px;pointer-events:none`;
    document.body.appendChild(p);
    p.animate([{ transform: "translate(0,0) rotate(0)", opacity: 1 }, { transform: `translate(${x}px,${y}px) rotate(${r}deg)`, opacity: 1, offset: 0.45 }, { transform: `translate(${x * 1.2}px,${y + 900}px) rotate(${r * 2}deg)`, opacity: 0 }], { duration: 1800 + Math.random() * 900, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => p.remove();
  }
}

/* =================== init =================== */
(async function init() {
  await ensureSamples();
  renderShell("Cases");
  C = Store.get(params.get("id"));
  if (!C) { $("#main").innerHTML = `<div class="card run-cta"><h1 class="d-m">Case not found</h1><p class="b-m c-ink2">It may have been created in another browser.</p><a class="btn btn-primary" href="/app">Back to dashboard</a></div>`; return; }
  R = C.result || null;
  if (R) {
    STAGES.forEach((s) => (stepState[s.id] = { st: "done", meta: s.tier }));
    for (const t of R.traces || []) stepState[t.stage] = { st: "done", meta: `${t.tier} · ${secs(t.latency_ms)}` };
    if (R.clauses) stepState.retrieve = { st: "done", meta: `${R.clauses.length} clauses` };
    if (!R.rescore) { stepState.revise = { st: "skip", meta: "not needed" }; stepState.rescore = { st: "skip", meta: "not needed" }; }
    status(`Built with ${R.totals?.calls ?? (R.traces || []).length} Nemotron calls · ${usd(R.totals?.cost)} · ${R.totals?.savings != null ? Math.round(R.totals.savings) + "% less than all-Ultra" : ""}`, "nano", true);
  } else status("Not built yet.", "nano", true);
  renderHeader(); renderPipe(); renderTabs(); renderRail(); renderPanel();
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b) return; if (editing) toggleEdit(); tab = b.dataset.t; renderTabs(); renderPanel(); });
  addEventListener("resize", moveInk);
  if (R?.ready) setTimeout(() => $("#stamp")?.classList.add("go"), 700);
  if (!R && params.get("run") === "1") { history.replaceState(null, "", `/app/case?id=${encodeURIComponent(C.id)}`); run(); }
})();
