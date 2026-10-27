"use strict";
/* New appeal wizard: 5 steps, uploads, live Nano intake preview, then hand-off to the case workspace. */

// ?replay=1 (demo recordings only): paces cached sample reads so they look the way a live run does.
const REPLAY = new URLSearchParams(location.search).get("replay") === "1";

const STEPS = [
  { key: "denial", label: "Denial letter", title: "Let’s start with the denial letter.", sub: "Upload the letter or Explanation of Benefits your insurer sent. Nemotron Nano reads it in about a second.", required: true,
    drop: "Drop your denial letter here", ph: "Paste the full denial letter or Explanation of Benefits…" },
  { key: "policy", label: "Policy", title: "Add your plan’s policy document.", sub: "Your Evidence of Coverage or Summary Plan Description. Long is fine — only the clauses that matter reach the models.",
    drop: "Drop your policy document here", ph: "Paste your Evidence of Coverage, Summary Plan Description, or the relevant pages…" },
  { key: "records", label: "Medical records", title: "Add the medical records that back you up.", sub: "Clinic notes, test results, therapy notes, referral letters. Dated findings make the strongest arguments.",
    drop: "Drop medical records here", ph: "Paste clinic notes, test results, therapy notes…" },
  { key: "notes", label: "Your story", title: "In your own words, what happened?", sub: "Optional, but it helps. What care did you need, why, and what did the insurer miss?" },
  { key: "review", label: "Review & build", title: "Ready to build your appeal.", sub: "Here’s what the three Nemotron models will work from." },
];
const TIPS = {
  denial: [["Include every page", "The appeal deadline is often on the last page."], ["Text PDFs work best", "Scanned images? Paste the text instead."], ["Keep the original", "Mail a copy; keep the envelope with its postmark."]],
  policy: [["Search for “appeal”", "The appeals section sets your deadlines."], ["Look for clinical policies", "Criteria like “6 weeks of therapy” live there."], ["Employer plan?", "Ask HR for the Summary Plan Description."]],
  records: [["Dates matter", "Findings dated before the service are strongest."], ["Objective findings", "Strength scores, imaging, lab values."], ["Doctor’s letter", "A letter of medical necessity carries the most weight."]],
};
const PROMPTS = ["Why did you need this care?", "What would have happened without it?", "Did your doctor say it was urgent?", "What did the insurer get wrong?"];

const S = { step: 0, docs: { denial: "", policy: "", records: "", notes: "" }, files: { denial: [], policy: [], records: [] }, paste: {}, intake: null, intakeFor: "", sample: null, loading: false };

/* ---------- stepper ---------- */
function renderStepper() {
  const reachable = (i) => i === 0 || S.docs.denial.trim().length >= 40;
  $("#stepper").innerHTML = STEPS.map((s, i) => `${i ? `<span class="stp-line ${i <= S.step ? "done" : ""}"><i></i></span>` : ""}
    <button class="stp ${i === S.step ? "on" : i < S.step ? "done" : ""}" data-i="${i}" ${reachable(i) ? "" : "disabled"}>
      <span class="n">${i < S.step ? ic("check") : i + 1}</span><span class="lbl">${s.label}</span></button>`).join("");
  $$(".stp .n .i").forEach((x) => (x.style.cssText = "width:14px;height:14px;stroke-width:2.6"));
}

/* ---------- panes ---------- */
function docPane(st) {
  const k = st.key, files = S.files[k], txt = S.docs[k];
  const showText = S.paste[k] || (txt && !files.length);
  return `<div class="wz-pane">
    <div class="drop" id="drop">
      <span class="tile bg-brand-tint">${ic("upload")}</span>
      <h3 class="h-m">${st.drop}</h3>
      <p class="b-s c-muted">PDF or plain text · up to 15 MB · drop several files at once</p>
      <div class="drop-actions"><button class="btn btn-secondary" id="browse">Browse files</button><button class="btn btn-ghost" id="pasteToggle">${showText ? "Hide text" : "Paste text instead"}</button></div>
    </div>
    ${files.map((f, i) => `<div class="card filecard"><span class="tile bg-ultra">${f.name.toLowerCase().endsWith(".pdf") ? "PDF" : "TXT"}</span>
      <div class="grow"><div class="l-m" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</div><div class="b-s c-muted">${f.chars.toLocaleString()} characters extracted</div></div>
      <span class="tile bg-nano" style="width:26px;height:26px;border-radius:50%">${ic("check")}</span>
      <button class="icon-btn" data-rm="${i}" aria-label="Remove ${esc(f.name)}" style="width:32px;height:32px">${ic("x")}</button></div>`).join("")}
    ${showText ? `<textarea class="paste" id="text" placeholder="${esc(st.ph)}" spellcheck="false">${esc(txt)}</textarea>` : ""}
    ${k === "denial" ? `<div class="chips"><span class="b-s c-muted">No letter handy? Try a sample:</span><span id="sampleChips" class="chips"></span></div>` : ""}
    <div class="tips">${TIPS[k].map(([t, d]) => `<div><span class="l-s">${t}</span><p class="b-s c-muted">${d}</p></div>`).join("")}</div>
    ${navBar(k === "denial" ? txt.trim().length >= 40 : true, k !== "denial")}
  </div>`;
}

function storyPane() {
  return `<div class="wz-pane">
    <div class="chips">${PROMPTS.map((p) => `<button class="schip" data-prompt="${esc(p)}">${esc(p)}</button>`).join("")}</div>
    <textarea class="paste" id="text" style="min-height:320px;font:400 16px/1.65 var(--sans)" placeholder="For example: My foot was getting weaker every day. My doctor said we couldn’t wait six weeks for therapy to finish.">${esc(S.docs.notes)}</textarea>
    <p class="b-s c-muted" style="margin:0">This goes into the letter only where it’s supported by your records.</p>
    ${navBar(true, true)}
  </div>`;
}

function reviewPane() {
  const items = [["denial", "Denial letter", "doc"], ["policy", "Policy document", "clipboard"], ["records", "Medical records", "heart"], ["notes", "Your story", "edit"]];
  return `<div class="wz-pane">
    <div class="card card-pad review-list">
      ${items.map(([k, l, i]) => { const n = S.docs[k].trim().length; return `<div class="rv"><span class="tile ${n ? "bg-nano" : "bg-s2"}">${ic(n ? "check" : i)}</span>
        <div class="grow"><div class="l-m">${l}</div><div class="b-s c-muted">${n ? `${n.toLocaleString()} characters${S.files[k]?.length ? ` · ${S.files[k].length} file${S.files[k].length > 1 ? "s" : ""}` : ""}` : k === "denial" ? "Required" : "Not added — the appeal will be weaker without it"}</div></div>
        <button class="btn btn-ghost btn-sm" data-goto="${items.findIndex((x) => x[0] === k)}">${n ? "Edit" : "Add"}</button></div>`; }).join("")}
    </div>
    <div class="est">
      <div><span class="caps c-muted">Model calls</span><div class="v">6–7</div><span class="b-s c-muted">Nano, Super and Ultra</span></div>
      <div><span class="caps c-muted">Time</span><div class="v">~40s</div><span class="b-s c-muted">streamed live</span></div>
      <div><span class="caps c-muted">Model cost</span><div class="v">~$0.03</div><span class="b-s c-muted">on Nebius Token Factory</span></div>
    </div>
    <div class="wz-nav"><span class="b-s c-muted grow">Documents are processed for this request only and never stored on our server.</span>
      <button class="btn btn-ghost" id="back">Back</button><button class="btn btn-primary btn-lg" id="build">Build my appeal ${ic("arrow", "arrow")}<span class="sheen"></span></button></div>
  </div>`;
}

function navBar(canNext, optional) {
  const last = S.step === STEPS.length - 2;
  return `<div class="wz-nav"><span class="b-s c-muted grow">Your documents are processed for this request only and never stored.</span>
    ${S.step ? `<button class="btn btn-ghost" id="back">Back</button>` : `<a class="btn btn-ghost" href="/app">Cancel</a>`}
    ${optional && !S.docs[STEPS[S.step].key].trim() ? `<button class="btn btn-secondary" id="next">Skip</button>` : `<button class="btn btn-primary" id="next" ${canNext ? "" : "disabled"}>${last ? "Review" : `Continue to ${STEPS[S.step + 1].label.toLowerCase()}`} ${ic("arrow", "arrow")}<span class="sheen"></span></button>`}
  </div>`;
}

/* ---------- found panel ---------- */
function renderFound(mode) {
  const f = $("#found");
  const d = S.intake;
  if (mode === "loading") {
    f.innerHTML = `<div class="found-head"><h3 class="h-s grow">What we found</h3><span class="tier t-nano">Nano</span></div>
      ${["Insurer", "Claim", "Service", "Amount billed", "Denial reason", "Category", "Appeal deadline"].map((k) => `<div class="frow"><span class="caps c-muted">${k}</span><span class="skel" style="height:16px;width:${50 + Math.random() * 40}%"></span></div>`).join("")}
      <div class="found-foot"><span class="status s-running" style="border:0;background:none;padding:0">Nemotron Nano is reading your letter…</span></div>`;
    return;
  }
  if (!d) {
    f.innerHTML = `<div class="found-head"><h3 class="h-s grow">What we found</h3><span class="tier t-nano">Nano</span></div>
      <div class="found-empty"><span class="tile bg-nano">${ic("spark")}</span><p class="l-m" style="color:var(--ink);margin:0 0 4px">Waiting for your denial letter</p><p class="b-s" style="margin:0">Once you add it, Nano pulls out the insurer, the claim, the reason and your deadline.</p></div>`;
    return;
  }
  const left = d.days_left;
  const rows = [
    ["Insurer", d.insurer, ""], ["Claim", d.claim_number, "mono-m"], ["Service", d.service, ""],
    ["Amount billed", d.amount_billed != null ? `$${Number(d.amount_billed).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null, "mono-m"],
    ["Denial reason", d.denial_reason_quoted ? `“${d.denial_reason_quoted}”` : null, "q"],
    ["Category", CATEGORY[d.category] || d.category, "chip-u"],
    ["Appeal deadline", d.deadline ? `${fmtDate(d.deadline)} · ${left < 0 ? "past due" : `${left} days left`}` : d.appeal_window_days ? `${d.appeal_window_days} days from the notice` : null, "chip-b"],
  ];
  f.innerHTML = `<div class="found-head"><h3 class="h-s grow">What we found</h3><span class="tier t-nano">Nano</span></div>
    ${rows.map(([k, v, kind], i) => `<div class="frow pop" style="animation-delay:${i * 0.09}s"><span class="caps c-muted">${k}</span>${
      v == null ? `<span class="b-s c-muted">Not in the letter</span>`
      : kind.startsWith("chip") ? `<span><span class="tier ${kind === "chip-u" ? "t-ultra" : "t-nano"}" style="text-transform:none;letter-spacing:0;font-weight:500;font-size:13px">${esc(v)}</span></span>`
      : `<span class="v ${kind}">${esc(v)}</span>`}</div>`).join("")}
    ${d.urgent ? `<div class="frow"><span class="tier t-ultra" style="text-transform:none;letter-spacing:0;font-size:13px">Urgent care — ask for an expedited appeal</span></div>` : ""}
    <div class="found-foot"><span class="b-s c-ink2 grow">${S.intakeTrace ? (REPLAY ? "Read by NVIDIA Nemotron Nano" : `Read by Nano in ${secs(S.intakeTrace.latency_ms)}${S.intakeTrace.cached ? " (cached)" : ""}`) : "Something off? You can edit the letter."}</span></div>`;
}

async function runIntake() {
  const denial = S.docs.denial.trim();
  if (denial.length < 40 || S.intakeFor === denial) return;
  S.intakeFor = denial;
  renderFound("loading");
  try {
    const res = await fetch("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ denial, policy: S.docs.policy }) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || "Intake failed");
    // ?replay=1 (demo recordings): a cached read is instant, so give Nano a visible moment to "read".
    if (REPLAY && body.trace?.cached) await sleep(1300);
    S.intake = body.intake;
    S.intakeTrace = body.trace;
  } catch (e) {
    S.intakeFor = "";
    S.intake = null;
    toast(e.message);
  }
  renderFound();
}

/* ---------- step rendering ---------- */
function go(i) {
  if (S.step === 0 && i > 0) runIntake();
  S.step = i;
  const st = STEPS[i];
  $("#stepCap").textContent = `New appeal · Step ${i + 1} of ${STEPS.length}`;
  $("#stepTitle").textContent = st.title;
  $("#stepSub").textContent = st.sub;
  renderStepper();
  $("#pane").innerHTML = st.key === "notes" ? storyPane() : st.key === "review" ? reviewPane() : docPane(st);
  bindPane();
  if (st.key === "denial") renderSampleChips();
  scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
}

async function renderSampleChips() {
  const el = $("#sampleChips");
  if (!el) return;
  const samples = await getSamples();
  el.innerHTML = samples.map((s) => `<button class="schip" data-sample="${esc(s.id)}">${esc(s.short)} · ${esc(CATEGORY[s.category] || "")}</button>`).join("");
}

async function useSample(id) {
  const s = await (await fetch(`/api/samples/${encodeURIComponent(id)}`)).json();
  S.sample = id;
  for (const k of ["denial", "policy", "records", "notes"]) S.docs[k] = s[k] || "";
  S.files = { denial: [{ name: `${s.meta.insurer.replace(/\W+/g, "_")}_denial.txt`, chars: s.denial.length }], policy: [{ name: "Evidence_of_Coverage.txt", chars: s.policy.length }], records: [{ name: "Medical_records.txt", chars: s.records.length }] };
  toast("Sample loaded — all four documents are filled in.");
  go(0);
  runIntake();
}

async function addFiles(fileList) {
  const k = STEPS[S.step].key;
  for (const file of fileList) {
    toast(`Reading ${file.name}…`);
    try {
      const r = await uploadText(file);
      S.docs[k] = S.docs[k].trim() ? `${S.docs[k].trim()}\n\n${r.text}` : r.text;
      S.files[k].push({ name: r.filename || file.name, chars: r.chars });
      S.sample = null;
    } catch (e) { toast(e.message); }
  }
  go(S.step);
  if (k === "denial") runIntake();
}

function bindPane() {
  const k = STEPS[S.step].key;
  const ta = $("#text");
  if (ta) ta.addEventListener("input", () => {
    S.docs[k] = ta.value; S.sample = null;
    const nb = $("#next");
    if (k === "denial" && nb) nb.disabled = ta.value.trim().length < 40;
    if (k !== "denial" && nb) { // Skip becomes Continue once something is typed, without re-rendering (keeps focus)
      const last = S.step === STEPS.length - 2;
      if (ta.value.trim()) { nb.className = "btn btn-primary"; nb.innerHTML = `${last ? "Review" : `Continue to ${STEPS[S.step + 1].label.toLowerCase()}`} ${ic("arrow", "arrow")}`; }
      else { nb.className = "btn btn-secondary"; nb.textContent = "Skip"; }
    }
    renderStepper();
  });
  $("#browse")?.addEventListener("click", () => $("#fileInput").click());
  $("#pasteToggle")?.addEventListener("click", () => { S.paste[k] = !($("#text")); go(S.step); setTimeout(() => $("#text")?.focus(), 50); });
  $$("[data-rm]").forEach((b) => b.addEventListener("click", () => { S.files[k].splice(+b.dataset.rm, 1); if (!S.files[k].length) { S.docs[k] = ""; } go(S.step); }));
  $$("[data-prompt]").forEach((b) => b.addEventListener("click", () => { const t = $("#text"); t.value = (t.value.trim() ? t.value.trim() + "\n\n" : "") + b.dataset.prompt + " "; t.focus(); S.docs.notes = t.value; }));
  $$("[data-goto]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.goto)));
  $("#sampleChips")?.addEventListener("click", (e) => { const b = e.target.closest("[data-sample]"); if (b) useSample(b.dataset.sample); });
  $("#next")?.addEventListener("click", () => go(S.step + 1));
  $("#back")?.addEventListener("click", () => go(S.step - 1));
  $("#build")?.addEventListener("click", build);
  const drop = $("#drop");
  if (drop) {
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
  }
}

async function build() {
  const btn = $("#build");
  btn.disabled = true;
  if (!S.intake) await runIntake();
  const d = S.intake || {};
  const id = S.sample ? "sample-" + S.sample : Store.newId();
  const existing = Store.get(id);
  const title = (d.service || "Insurance appeal").replace(/\s*\(.*?\)\s*/g, " ").trim();
  Store.save({
    ...(existing || {}), id, sample: S.sample, created: existing?.created || Date.now(),
    title: existing?.title || (title.length > 44 ? title.slice(0, 42) + "…" : title.charAt(0).toUpperCase() + title.slice(1)),
    insurer: d.insurer || existing?.insurer || "Your insurer", claim: d.claim_number || existing?.claim || "", amount: d.amount_billed ?? existing?.amount ?? null,
    category: d.category || existing?.category, deadline: d.deadline || existing?.deadline || null, window: d.appeal_window_days || existing?.window || 180,
    status: "draft", inputs: S.sample ? null : { ...S.docs }, intake: d, result: null, score: null, firstScore: null,
  });
  location.href = `/app/case?id=${encodeURIComponent(id)}&run=1`;
}

(async function init() {
  renderShell("New appeal");
  $("#fileInput").addEventListener("change", (e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ""; });
  renderFound();
  const sample = new URLSearchParams(location.search).get("sample");
  if (sample) await useSample(sample); else go(0);
})();
