"use strict";
/* Know your rights: denial-type guides with a detail drawer. General information, not legal advice. */

const GUIDES = [
  { id: "medical_necessity", title: "Medical necessity", tone: "ultra", icon: "heart", chips: ["Plan clinical policy", "ACA appeal rights"],
    lede: "Show the plan’s own clinical criteria were met — with dated findings from your records.",
    wins: ["Quote the plan’s clinical policy word for word, then match each criterion to a dated record.", "Point to exceptions (like “red flag” symptoms) that waive step-therapy or waiting rules.", "Ask your doctor for a short letter of medical necessity.", "Request a peer-to-peer review between your doctor and the plan’s reviewer."],
    include: ["The denial notice", "Clinic notes showing symptoms and exam findings", "Test results and imaging reports", "Letter of medical necessity"],
    sample: "mri-red-flags" },
  { id: "prior_authorization", title: "Prior authorization", tone: "super", icon: "clipboard", chips: ["Plan PA rules", "Continuity of care"],
    lede: "Ask for retro-authorization when the care would have been approved anyway.",
    wins: ["Show the request was sent (fax confirmation, portal screenshot) even if it was never answered.", "Show the treatment meets the plan’s coverage criteria on the merits.", "If you switched plans mid-treatment, cite continuity-of-care provisions.", "If care is ongoing, ask your provider to request an expedited appeal."],
    include: ["Proof the authorization request was submitted", "Treatment history and prior approvals", "Notes on why delaying care was unsafe"],
    sample: "infusion-prior-auth" },
  { id: "out_of_network", title: "Out of network", tone: "local", icon: "globe", chips: ["No Surprises Act", "ERISA §503"],
    lede: "Emergency care must be covered at in-network cost sharing, wherever you were taken.",
    wins: ["Describe the symptoms as a prudent layperson would have seen them in the moment.", "Show the facility was the nearest one, or that EMS chose it.", "For emergencies, cite federal protections against surprise bills.", "For non-emergencies, show no in-network provider was available in time."],
    include: ["Emergency department records", "EMS/ambulance report", "Your account of the symptoms"],
    sample: "er-out-of-network" },
  { id: "experimental_investigational", title: "Experimental treatment", tone: "nano", icon: "flask", chips: ["External review", "State law"],
    lede: "Peer-reviewed evidence and a specialist’s letter carry the most weight here.",
    wins: ["Cite peer-reviewed studies and clinical guidelines that support the treatment.", "Show standard treatments were tried and failed, or aren’t safe for you.", "Ask a specialist to explain why this is the accepted approach for your case.", "Expect to use external review — independent reviewers often weigh evidence differently."],
    include: ["Specialist letter", "Published studies or guideline excerpts", "History of treatments already tried"] },
  { id: "coding_billing", title: "Coding & billing", tone: "brand-tint", icon: "code", chips: ["Corrected claim", "Provider appeal"],
    lede: "Often fixed fastest by a corrected claim from your provider’s billing office.",
    wins: ["Compare the codes on the denial with what actually happened at the visit.", "Ask the provider’s billing office to submit a corrected claim.", "If the insurer bundled or downcoded services, ask for the coding policy they applied."],
    include: ["Itemized bill", "Explanation of Benefits", "Visit summary"] },
  { id: "not_covered", title: "Not a covered benefit", tone: "s2", icon: "ban", chips: ["Plan document", "External review"],
    lede: "Read the exact exclusion — narrow wording often doesn’t fit your situation.",
    wins: ["Find the exclusion the insurer cited and read its exact wording.", "Show how your care falls outside it, or under a covered benefit instead.", "Check whether state benefit mandates require coverage."],
    include: ["The plan document section cited in the denial", "Records showing why the service was needed"] },
];

function card(g) {
  return `<button class="card rcard" data-id="${g.id}"><span class="top"><span class="tile bg-${g.tone}">${ic(g.icon)}</span>${ic("ext")}</span>
    <h3 class="h-m">${g.title}</h3><p class="b-s c-ink2">${g.lede}</p><span class="chips-row">${g.chips.map((c) => `<span class="chip">${c}</span>`).join("")}</span></button>`;
}

function render(q = "") {
  const s = q.toLowerCase();
  const list = GUIDES.filter((g) => !s || [g.title, g.lede, ...g.chips, ...g.wins].join(" ").toLowerCase().includes(s));
  $("#grid").innerHTML = list.length ? list.map(card).join("") : `<p class="b-m c-muted">Nothing matches “${esc(q)}”.</p>`;
}

function open(id) {
  const g = GUIDES.find((x) => x.id === id);
  const d = $("#drawer");
  d.innerHTML = `<div class="rdrawer-head"><span class="tile bg-${g.tone}">${ic(g.icon)}</span><h2 class="h-m grow">${g.title}</h2><button class="icon-btn" id="close" aria-label="Close">${ic("x")}</button></div>
    <div class="rdrawer-body">
      <p class="d-m" style="margin:0;font-size:26px">${g.lede}</p>
      <div><h4 class="caps c-brand6">What usually wins</h4><ul>${g.wins.map((w) => `<li>${w}</li>`).join("")}</ul></div>
      <div><h4 class="caps c-brand6">What to include</h4><ul>${g.include.map((w) => `<li>${w}</li>`).join("")}</ul></div>
      <div><h4 class="caps c-brand6">Rules to look for</h4><div class="chips">${g.chips.map((c) => `<span class="chip">${c}</span>`).join("")}</div></div>
      <div class="card card-pad" style="background:var(--brand-tint);border:0;display:flex;flex-direction:column;gap:12px">
        <p class="h-s c-brand" style="margin:0">Have a ${g.title.toLowerCase()} denial?</p>
        <p class="b-s c-ink2" style="margin:0">AppealPilot finds the clauses your plan has to follow and drafts the appeal for you.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-primary btn-sm" href="/app/new">Start an appeal</a>${g.sample ? `<a class="btn btn-secondary btn-sm" href="/app/new?sample=${g.sample}">Try a sample</a>` : ""}</div>
      </div>
      <p class="b-s c-muted" style="margin:0">General information, not legal advice.</p>
    </div>`;
  d.classList.add("open"); d.setAttribute("aria-hidden", "false"); $("#dscrim").classList.add("show");
  $("#close").addEventListener("click", close); $("#close").focus();
}
function close() { $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); $("#dscrim").classList.remove("show"); }

renderShell("Know your rights");
render();
initReveal();
$("#grid").addEventListener("click", (e) => { const c = e.target.closest(".rcard"); if (c) open(c.dataset.id); });
$("#dscrim").addEventListener("click", close);
addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
$("#q").addEventListener("input", (e) => render(e.target.value));
