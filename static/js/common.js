"use strict";
/* Shared helpers for every AppealPilot page: icons, app shell, case store, motion, streaming. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- icons (24px stroke set, matching the Figma file) ---------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  newfile: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 12v6M9 15h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5m6 6-6-6 6-6"/>',
  upload: '<path d="M12 15V3m0 0-4 4m4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>',
  print: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  dollar: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 14 4-4"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  ext: '<path d="M7 17 17 7M9 7h8v8"/>', redo: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  heart: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-9V3"/>',
  code: '<path d="M8 4h8M8 20h8M4 8v8M20 8v8"/><path d="m9 12 2 2 4-4"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>', trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
};
const ic = (name, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
const LOGO = `<a class="logo" href="/" aria-label="AppealPilot home"><span class="logo-mark"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></span>AppealPilot</a>`;

/* ---------- formatting ---------- */
const CATEGORY = {
  medical_necessity: "Medical necessity", prior_authorization: "Prior authorization", out_of_network: "Out of network",
  coding_billing: "Coding & billing", experimental_investigational: "Experimental", not_covered: "Not covered",
  timely_filing: "Timely filing", other: "Other",
};
const money = (n) => (n == null || isNaN(n) ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const usd = (n) => (n == null || isNaN(n) ? "—" : `$${n < 0.1 ? n.toFixed(4) : n.toFixed(3)}`);
const secs = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const daysUntil = (iso) => (iso ? Math.round((new Date(iso + "T00:00:00") - new Date(new Date().toDateString())) / 864e5) : null);
const fmtDate = (iso, opts = { month: "short", day: "numeric", year: "numeric" }) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, opts) : "—");
const isoIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const scoreTone = (s) => (s >= 85 ? "nano" : s >= 70 ? "super" : "ultra");
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");
const deltaPill = (d, unit = "") => `<span class="pill ${d >= 0 ? "pill-good" : "pill-bad"}">${d >= 0 ? "▲" : "▼"} ${signed(d)}${unit}</span>`;
const STATUS = { draft: ["Drafting", "s-draft"], running: ["Building", "s-running"], ready: ["Ready to send", "s-ready"], needs: ["Needs info", "s-needs"], sent: ["Submitted", "s-sent"], won: ["Overturned", "s-won"] };
const statusPill = (s) => `<span class="status ${STATUS[s]?.[1] || ""}">${STATUS[s]?.[0] || s}</span>`;

/* ---------- case store (this browser only) ---------- */
const Store = {
  KEY: "appealpilot.cases.v1",
  all() { try { return JSON.parse(localStorage.getItem(this.KEY) || "[]"); } catch { return []; } },
  write(list) { try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch { toast("Couldn't save — browser storage is full or blocked."); } },
  get(id) { return this.all().find((c) => c.id === id) || null; },
  save(c) { const list = this.all(); const i = list.findIndex((x) => x.id === c.id); c.updated = Date.now(); if (i >= 0) list[i] = c; else list.unshift(c); this.write(list); return c; },
  remove(id) { this.write(this.all().filter((c) => c.id !== id)); },
  newId() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
};

async function getSamples() {
  if (getSamples.cache) return getSamples.cache;
  try { getSamples.cache = await (await fetch("/api/samples")).json(); } catch { getSamples.cache = []; }
  return getSamples.cache;
}

/** Make sure the sample cases exist in the store (as drafts) so a first visit has something to explore. */
async function ensureSamples() {
  const samples = await getSamples();
  const list = Store.all();
  let changed = false;
  for (const s of samples) {
    const id = "sample-" + s.id;
    if (list.some((c) => c.id === id) || localStorage.getItem("appealpilot.hide." + id)) continue;
    list.push({ id, sample: s.id, title: s.short, insurer: s.insurer, claim: s.claim, amount: s.amount, category: s.category, window: s.window,
      deadline: isoIn(s.days_left), status: "draft", created: Date.now(), updated: Date.now() });
    changed = true;
  }
  if (changed) Store.write(list);
}

/** Create a case from a sample and return its id (used by "Watch a sample case"). */
async function caseFromSample(sampleId) {
  await ensureSamples();
  return "sample-" + sampleId;
}

/* ---------- app shell ---------- */
async function renderShell(active) {
  const NAV = [["Dashboard", "/app", "home"], ["New appeal", "/app/new", "newfile"], ["Cases", "/app#cases", "folder"], ["Know your rights", "/app/rights", "shield"], ["Technology", "/app/technology", "cpu"]];
  const count = Store.all().filter((c) => !["won"].includes(c.status)).length;
  const side = $("#sidebar");
  side.innerHTML = `${LOGO}
    <p class="caps side-cap">Workspace</p>
    ${NAV.map(([l, href, i]) => `<a class="nav-item ${l === active ? "active" : ""}" href="${href}">${ic(i)}${l}${l === "Cases" ? `<span class="count">${count}</span>` : ""}</a>`).join("")}
    <div class="side-spacer"></div>
    <div class="credits" id="credits">
      <div class="row"><span class="l-s">Token Factory spend</span><span class="mono c-ink2" id="spendV">—</span></div>
      <div class="bar"><i id="spendBar"></i></div>
      <span class="b-s c-muted" id="spendNote">Checking…</span>
    </div>
    <div class="user"><span class="avatar">${ic("folder")}</span><div><div class="l-s">Your workspace</div><div class="b-s c-muted">Cases saved in this browser</div></div></div>`;
  $(".avatar", side).style.cssText = "background:var(--brand-tint);color:var(--brand)";
  document.body.insertAdjacentHTML("afterbegin", `<div class="mobile-bar">${LOGO}<button class="icon-btn" id="menuBtn" aria-label="Open menu">${ic("menu")}</button></div><div class="scrim" id="scrim"></div>`);
  const open = (on) => { side.classList.toggle("open", on); $("#scrim").classList.toggle("show", on); };
  $("#menuBtn").addEventListener("click", () => open(true));
  $("#scrim").addEventListener("click", () => open(false));
  try {
    const h = await (await fetch("/api/health")).json();
    window.__health = h;
    if (!h.live) {
      $("#spendV").textContent = "demo";
      $("#spendNote").textContent = "Demo mode — no credits used";
      $("#spendBar").style.width = "0";
    } else {
      $("#spendV").textContent = usd(h.spent_usd || 0);
      $("#spendNote").textContent = `of $${(h.cap_usd || 0).toFixed(2)} safety cap`;
      requestAnimationFrame(() => ($("#spendBar").style.width = `${Math.min(100, (100 * (h.spent_usd || 0)) / (h.cap_usd || 1))}%`));
    }
  } catch { $("#spendNote").textContent = "Offline"; }
}

/* ---------- motion ---------- */
function tween(el, to, { dur = 1000, fmt = (v) => Math.round(v).toLocaleString(), from } = {}) {
  const start = from ?? (parseFloat(el.dataset.v) || 0);
  el.dataset.v = to;
  if (REDUCED || document.hidden) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(start + (to - start) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => (el.textContent = fmt(to)), dur + 400); // land on the exact value even if frames were throttled
}

function initReveal(root = document) {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    $$("[data-count]", e.target).forEach((c) => tween(c, parseFloat(c.dataset.count), { dur: 1500, fmt: (v) => (c.dataset.prefix || "") + v.toFixed(+(c.dataset.dec || 0)) + (c.dataset.suffix || "") }));
    $$(".bar > i[data-w]", e.target).forEach((b) => (b.style.width = b.dataset.w));
    io.unobserve(e.target);
  }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  $$(".reveal", root).forEach((el) => io.observe(el));
  // Anything already scrolled past (anchor jumps, restored scroll) is revealed at once, never left blank.
  const sweep = () => $$(".reveal:not(.in)", root).forEach((el) => { if (el.getBoundingClientRect().top < innerHeight * 0.92) { el.classList.add("in"); $$(".bar > i[data-w]", el).forEach((b) => (b.style.width = b.dataset.w)); $$("[data-count]", el).forEach((c) => (c.textContent = (c.dataset.prefix || "") + (+c.dataset.count).toFixed(+(c.dataset.dec || 0)) + (c.dataset.suffix || ""))); } });
  let t; addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(sweep, 120); }, { passive: true });
  setTimeout(sweep, 1200);
}

let toastTimer;
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ---------- gauge ---------- */
function gaugeSVG(size = 240) {
  return `<svg class="gauge-svg" viewBox="0 0 240 132" width="${size}" aria-hidden="true">
    <defs><linearGradient id="gArc${size}" x1="0" x2="1"><stop offset="0" stop-color="#C2412D"/><stop offset=".55" stop-color="#B7771A"/><stop offset="1" stop-color="#4E8A12"/></linearGradient></defs>
    <path d="M20 120 A100 100 0 0 1 220 120" fill="none" stroke="#F1EEE7" stroke-width="14" stroke-linecap="round"/>
    <path class="g-arc" d="M20 120 A100 100 0 0 1 220 120" fill="none" stroke="url(#gArc${size})" stroke-width="14" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>
    <g class="g-knob" style="transform-origin:120px 120px;transform:rotate(-90deg)"><circle cx="120" cy="20" r="13" fill="rgba(15,26,23,.08)"/><circle cx="120" cy="20" r="8" fill="#0F1A17" stroke="#fff" stroke-width="3"/></g>
  </svg>`;
}
function setGauge(root, score) {
  const arc = $(".g-arc", root), knob = $(".g-knob", root);
  requestAnimationFrame(() => {
    arc.style.transition = "stroke-dasharray 1.4s cubic-bezier(.2,.8,.2,1)";
    knob.style.transition = "transform 1.5s cubic-bezier(.34,1.4,.64,1)";
    arc.setAttribute("stroke-dasharray", `${score} 100`);
    knob.style.transform = `rotate(${-90 + score * 1.8}deg)`;
  });
}

/* ---------- server-sent events over POST ---------- */
async function streamPost(url, body, onEvent) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(Array.isArray(err.detail) ? err.detail.map((d) => d.msg).join("; ") : err.detail || `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const line = buf.slice(0, i).split("\n").find((l) => l.startsWith("data: "));
      buf = buf.slice(i + 2);
      if (line) await onEvent(JSON.parse(line.slice(6)));
    }
  }
}

async function uploadText(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/extract", { method: "POST", body: fd });
  const body = await res.json();
  if (!res.ok) throw new Error(body.detail || "Upload failed");
  return body;
}
