"""Canned model outputs for demo mode (no NEBIUS_API_KEY). They match the spine MRI sample,
so the UI can be explored end to end offline. Live mode never uses this module."""

import json

from .samples import render_dates

_INTAKE = {
    "patient_name": "Dana Whitfield",
    "member_id": "NWH-88213407",
    "insurer": "Northwind Health Plan",
    "plan_name": "Northwind Silver PPO 3500",
    "claim_number": "CLM-2026-0311-77412",
    "provider": "Lakeside Orthopedic & Spine, Dr. Priya Raman",
    "service": "MRI of the lower (lumbar) spine without contrast",
    "service_date": "{{T-48}}",
    "denial_date": "{{T-32}}",
    "amount_billed": 2340.0,
    "denial_reason_quoted": "The requested imaging is not medically necessary. Our records do not show that you completed at least six (6) weeks of conservative therapy before imaging was performed.",
    "denial_code": "MN-04",
    "category": "medical_necessity",
    "appeal_window_days": 180,
    "appeal_level": "internal",
    "urgent": False,
    "appeal_address": "Northwind Health Plan, Appeals Unit, PO Box 4417, Hartford, CT 06101",
    "summary": "Your insurer refused to pay for your back MRI because you hadn't done 6 weeks of therapy first.",
}

_EVIDENCE = {
    "strategy": "The six-week conservative therapy rule does not apply: the plan's own imaging policy waives it when red-flag findings such as progressive motor weakness or foot drop are present. Dana's records document a progressive L5 motor deficit before the MRI, and surgery was planned afterward, meeting two independent criteria.",
    "arguments": [
        {
            "point": "Criterion (b) of the plan's lumbar MRI policy was met: Dana had a progressive neurological deficit (partial foot drop), so conservative therapy was not required.",
            "support": [
                {"source": "policy", "ref": "P3", "quote": "Conservative therapy is not required when criterion (b) is met."},
                {"source": "records", "ref": "Clinic note, Dr. Raman, {{T-52}}", "quote": "Left ankle dorsiflexion strength 3/5 (right 5/5)."},
                {"source": "records", "ref": "Clinic note, Dr. Raman, {{T-52}}", "quote": "Left L5 radiculopathy with progressive motor deficit (partial foot drop)."},
            ],
            "strength": "strong",
        },
        {
            "point": "Criterion (c) was also met: surgical treatment was planned, and the MRI was required to plan it.",
            "support": [
                {"source": "policy", "ref": "P3", "quote": "surgical or interventional treatment (such as epidural steroid injection) is being planned."},
                {"source": "records", "ref": "Spine surgery consult, {{T-44}}", "quote": "Left L4-L5 microdiscectomy, scheduled {{T-30}}, given progressive motor deficit."},
            ],
            "strength": "strong",
        },
        {
            "point": "Conservative therapy was in fact underway and failing: NSAIDs from {{T-76}} and physical therapy from {{T-69}}, with documented decline.",
            "support": [
                {"source": "records", "ref": "PT progress note, {{T-55}}", "quote": "Therapist notes decline in function since initial evaluation on {{T-69}}."},
            ],
            "strength": "moderate",
        },
    ],
    "checklist": [
        {"item": "Clinic note from Dr. Raman ({{T-52}}) documenting motor deficit", "status": "have", "why": "Proves the red-flag exception."},
        {"item": "Physical therapy progress note ({{T-55}})", "status": "have", "why": "Shows conservative therapy was tried and failing."},
        {"item": "MRI report ({{T-48}})", "status": "have", "why": "Confirms severe nerve compression."},
        {"item": "Surgery consult ({{T-44}})", "status": "have", "why": "Meets the surgical-planning criterion."},
        {"item": "Letter of medical necessity signed by Dr. Raman", "status": "missing", "why": "Physician attestation carries the most weight with medical reviewers."},
        {"item": "Copy of the denial letter ({{T-32}})", "status": "have", "why": "Required with every appeal."},
    ],
    "legal_hooks": [
        {"name": "ACA internal and external appeal rights (45 CFR 147.136)", "applies_because": "Non-grandfathered plan issued a medical-necessity denial; independent external review is available if the internal appeal fails."},
        {"name": "Right to the claim file and criteria used", "applies_because": "The denial notice confirms the member may request all relevant documents free of charge."},
    ],
}

_LETTER_V1 = """[Date]

Dana Whitfield
212 Elm Street, Apt 4
Springfield, IL 62704

Northwind Health Plan
Appeals Unit
PO Box 4417
Hartford, CT 06101

RE: Request for Internal Appeal
Member: Dana Whitfield    Member ID: NWH-88213407
Claim Number: CLM-2026-0311-77412    Denial Code: MN-04
Service: MRI Lumbar Spine without contrast (CPT 72148)
Date of Service: {{T-48}}

To the Appeals Unit:

I am writing to formally appeal your {{T-32}} decision denying coverage for my lumbar spine MRI. The denial states the imaging "is not medically necessary" because I had not completed six weeks of conservative therapy.

Your own Advanced Imaging Clinical Policy (CP-IMG-114) says a lumbar MRI is medically necessary when ANY of three criteria are met, and that "Conservative therapy is not required when criterion (b) is met." Criterion (b) covers "progressive or severe neurological deficit (e.g. motor weakness, foot drop...)."

On {{T-52}}, Dr. Priya Raman documented left ankle weakness of 3/5, diminished reflexes and numbness in the L5 distribution, and diagnosed "progressive motor deficit (partial foot drop)." My symptoms were getting worse every day.

The MRI showed a large disc extrusion with severe compression of the L5 nerve root, and surgery was scheduled. This means criterion (c) was also met.

I ask that you overturn the denial and pay the claim.

Sincerely,
Dana Whitfield

Enclosures: Denial letter; clinic note ({{T-52}}); PT note ({{T-55}}); MRI report ({{T-48}}); surgery consult ({{T-44}})"""

_REVIEW_V1 = {
    "score": 68,
    "verdict": "revise",
    "insurer_rebuttal": "The clinical policy exception applies to severe or progressive deficits documented before imaging; a single note may be read as a stable deficit, and the surgical plan post-dates the MRI.",
    "strengths": [
        "Quotes the plan's own policy language that waives conservative therapy.",
        "Cites a dated objective exam finding (3/5 dorsiflexion).",
    ],
    "weaknesses": [
        {"issue": "Progression is asserted, not shown: no comparison against an earlier exam.", "fix": "Cite the {{T-55}} PT note showing decline since {{T-69}} and new inability to heel-walk.", "severity": "high"},
        {"issue": "Criterion (c) argument is weak because surgery was planned after the MRI.", "fix": "Frame (c) as supporting, and note the MRI was ordered specifically to evaluate for a surgical lesion.", "severity": "medium"},
        {"issue": "No request for peer-to-peer review or for the claim file and criteria.", "fix": "Invoke Section 9.2 peer-to-peer and the right to the claim file.", "severity": "medium"},
        {"issue": "No mention of the conservative therapy that was actually completed.", "fix": "State NSAIDs since {{T-76}} and PT since {{T-69}} (4 sessions) failed.", "severity": "low"},
    ],
    "missing_evidence": ["Letter of medical necessity from Dr. Raman"],
    "factual_errors": [],
}

_LETTER_V2 = """[Date]

Dana Whitfield
212 Elm Street, Apt 4
Springfield, IL 62704

Northwind Health Plan
Appeals Unit
PO Box 4417
Hartford, CT 06101

RE: Request for Internal Appeal of Adverse Benefit Determination
Member: Dana Whitfield    Member ID: NWH-88213407
Plan: Northwind Silver PPO 3500
Claim Number: CLM-2026-0311-77412    Denial Code: MN-04
Service: MRI Lumbar Spine without contrast (CPT 72148)
Date of Service: {{T-48}}    Amount Billed: $2,340.00

To the Appeals Unit:

I am requesting a formal internal appeal of your {{T-32}} determination denying coverage for my lumbar spine MRI. The notice states the imaging "is not medically necessary" because records do not show "at least six (6) weeks of conservative therapy before imaging was performed." That requirement does not apply to my case under your own clinical policy.

1. Your policy waives conservative therapy for progressive neurological deficits.
Section 4.2 of my Evidence of Coverage (Advanced Imaging Clinical Policy CP-IMG-114) states that lumbar MRI is medically necessary when ANY listed criterion is met, including "(b) ... progressive or severe neurological deficit (e.g. motor weakness, foot drop, loss of reflexes)," and that "Conservative therapy is not required when criterion (b) is met."

2. My records document a deficit that was both severe and progressing before the MRI.
On {{T-55}}, my physical therapist recorded that I was "unable to complete heel walking on left" and noted a "decline in function since initial evaluation on {{T-69}}." Three days later, on {{T-52}}, Dr. Priya Raman found left ankle dorsiflexion strength of 3/5 (right 5/5), left extensor hallucis longus 3/5, a reduced left Achilles reflex (1+), and numbness in the L5 distribution, and diagnosed "Left L5 radiculopathy with progressive motor deficit (partial foot drop)." Dr. Raman ordered the MRI urgently to evaluate for a compressive lesion.

3. Conservative therapy was underway and failing.
Although not required, I had been on prescription-strength ibuprofen and activity modification since {{T-76}}, and began physical therapy on {{T-69}}. My symptoms worsened despite this treatment.

4. The MRI confirmed a surgical lesion and directly guided treatment.
The {{T-48}} MRI showed a "large left paracentral disc extrusion at L4-L5 with severe compression of the traversing left L5 nerve root." On {{T-44}}, Dr. Owen Castillo recommended a left L4-L5 microdiscectomy. The MRI was ordered precisely to determine whether surgery was needed, consistent with criterion (c).

Requested action
Please overturn the denial and process claim CLM-2026-0311-77412 for payment. Under Section 9.2, I request a peer-to-peer review between Dr. Raman and your medical reviewer if any question remains, and I request a complete copy of my claim file and the clinical criteria used in this decision, free of charge. If this appeal is denied, I intend to pursue external review by an Independent Review Organization under Section 9.4.

Thank you for your prompt review.

Sincerely,

Dana Whitfield
[Phone]  [Email]

Enclosures:
1. Denial notice dated {{T-32}}
2. Physical therapy progress note, {{T-55}}
3. Clinic note, Dr. Priya Raman, {{T-52}}
4. MRI lumbar spine report, {{T-48}}
5. Spine surgery consult, Dr. Owen Castillo, {{T-44}}
6. [Letter of medical necessity from Dr. Raman]"""

_REVIEW_V2 = {
    "score": 89,
    "verdict": "ready",
    "insurer_rebuttal": "A reviewer could still ask for physician attestation, but the dated objective findings meet criterion (b) on their face.",
    "strengths": [
        "Shows progression with two dated observations before imaging.",
        "Maps evidence directly onto the plan's own criteria language.",
        "Requests peer-to-peer review and the claim file, and preserves external review.",
    ],
    "weaknesses": [
        {"issue": "Physician letter of medical necessity not yet enclosed.", "fix": "Ask Dr. Raman's office for a one-page letter before mailing.", "severity": "low"}
    ],
    "missing_evidence": ["Letter of medical necessity from Dr. Raman"],
    "factual_errors": [],
}

_RESPONSES = {
    "intake": json.dumps(_INTAKE),
    "evidence": json.dumps(_EVIDENCE),
    "draft": _LETTER_V1,
    "review": json.dumps(_REVIEW_V1),
    "revise": _LETTER_V2,
    "rescore": json.dumps(_REVIEW_V2),
}


def response(stage: str) -> str:
    return render_dates(_RESPONSES.get(stage, "{}"))
