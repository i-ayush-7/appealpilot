"""Sample cases for the demo. All people, plans, providers and numbers are fictional.

Dates are written as {{T-48}} (48 days before ANCHOR) and rendered per request.
"""

import os
import re
from datetime import date, timedelta

# Sample dates are fixed relative to this anchor (not to "today"), so sample prompts are
# byte-identical every day and their bundled cache stays valid. All sample dates fall before
# 2026-10-27 and every appeal deadline is in 2026-12 or later.
ANCHOR = date.fromisoformat(os.getenv("SAMPLE_ANCHOR", "2026-11-20"))

_REL = re.compile(r"\{\{T-(\d+)\}\}")


def render_dates(text: str) -> str:
    def fmt(m):
        d = ANCHOR - timedelta(days=int(m.group(1)))
        return f"{d:%B} {d.day}, {d.year}"
    return _REL.sub(fmt, text)

MRI_DENIAL = """NORTHWIND HEALTH PLAN
Utilization Management Department
PO Box 4410, Hartford, CT 06101

{{T-32}}

Dana Whitfield
212 Elm Street, Apt 4
Springfield, IL 62704

Member ID: NWH-88213407
Plan: Northwind Silver PPO 3500
Claim Number: CLM-2026-0311-77412
Provider: Lakeside Orthopedic & Spine, Dr. Priya Raman
Service: MRI Lumbar Spine without contrast (CPT 72148)
Date of Service: {{T-48}}
Amount Billed: $2,340.00

NOTICE OF ADVERSE BENEFIT DETERMINATION

Dear Dana Whitfield,

We have reviewed the claim listed above. This service has been DENIED.

Reason for denial: The requested imaging is not medically necessary. Our records do not show that you completed at least six (6) weeks of conservative therapy before imaging was performed, as required by our Advanced Imaging Clinical Policy (CP-IMG-114). Denial code: MN-04.

Your right to appeal: You or your authorized representative may request an internal appeal within 180 days of the date of this notice. Send your written appeal, along with any medical records or other information supporting your request, to: Northwind Health Plan, Appeals Unit, PO Box 4417, Hartford, CT 06101. If your situation is urgent, you may request an expedited appeal by calling 1-800-555-0142.

You may also be entitled to an external review by an Independent Review Organization after the internal appeal process. You may request, free of charge, copies of all documents and criteria relevant to your claim.

Sincerely,
Utilization Management Department
Northwind Health Plan"""

MRI_POLICY = """NORTHWIND HEALTH PLAN — EVIDENCE OF COVERAGE (EXCERPTS)

SECTION 4.1 COVERED SERVICES — DIAGNOSTIC IMAGING
The Plan covers diagnostic imaging, including X-ray, CT and MRI, when ordered by a licensed provider and medically necessary to diagnose or treat an illness or injury.

SECTION 4.2 ADVANCED IMAGING CLINICAL POLICY (CP-IMG-114) — LUMBAR SPINE MRI
MRI of the lumbar spine is considered medically necessary for low back pain when ANY of the following criteria are met:
(a) the member has completed at least six (6) weeks of provider-directed conservative therapy (such as physical therapy, NSAIDs, or activity modification) without adequate improvement; OR
(b) the member presents with "red flag" findings, including progressive or severe neurological deficit (e.g. motor weakness, foot drop, loss of reflexes), suspected cauda equina syndrome, suspected malignancy, infection, or fracture; OR
(c) surgical or interventional treatment (such as epidural steroid injection) is being planned.
Conservative therapy is not required when criterion (b) is met.

SECTION 7.3 DEFINITION OF MEDICAL NECESSITY
Medically Necessary means health care services that a prudent physician would provide to a patient to diagnose or treat an illness or injury in accordance with generally accepted standards of medical practice, clinically appropriate in type, frequency, extent and duration, and not primarily for the convenience of the patient or provider.

SECTION 9.1 INTERNAL APPEALS
A member may file an internal appeal of any adverse benefit determination within 180 days after receiving notice. The appeal will be reviewed by a person who was not involved in the initial determination. For appeals involving medical judgment, the Plan will consult a health care professional with appropriate training and experience in the field of medicine involved. The Plan will issue a decision within 30 days for pre-service claims and 60 days for post-service claims.

SECTION 9.2 PEER-TO-PEER REVIEW
The treating provider may request a peer-to-peer discussion with the Plan's medical reviewer at any time during the appeal.

SECTION 9.4 EXTERNAL REVIEW
If the internal appeal is denied, the member may request external review by an Independent Review Organization within 4 months. The decision of the Independent Review Organization is binding on the Plan.

SECTION 11.2 PHARMACY BENEFITS
Prescription drugs are covered according to the Plan formulary. Specialty drugs may require prior authorization.

SECTION 12.5 COORDINATION OF BENEFITS
When a member is covered by more than one plan, benefits are coordinated according to the order-of-benefit determination rules."""

MRI_RECORDS = """LAKESIDE ORTHOPEDIC & SPINE — CLINIC NOTE
Date: {{T-52}}   Provider: Priya Raman, MD
Patient: Dana Whitfield   DOB: 07/14/1984

Chief complaint: Low back pain radiating to left leg x 4 weeks, worsening over past 10 days.
History: Onset after lifting boxes on {{T-80}}. Started ibuprofen 600 mg TID and activity modification at urgent care visit on {{T-76}}. Began physical therapy {{T-69}} (4 sessions). Pain now 8/10. New numbness in left foot and difficulty lifting left foot when walking, noticed 5 days ago.
Exam: Left ankle dorsiflexion strength 3/5 (right 5/5). Left extensor hallucis longus 3/5. Diminished sensation over dorsum of left foot (L5 dermatome). Positive straight-leg raise on left at 40 degrees. Reflexes: left Achilles 1+, right 2+. No saddle anesthesia, no bowel/bladder changes.
Assessment: Left L5 radiculopathy with progressive motor deficit (partial foot drop). Suspect L4-L5 disc herniation.
Plan: Urgent MRI lumbar spine without contrast to evaluate for compressive lesion; surgical consult depending on findings. Continue PT as tolerated. Return precautions given for bowel/bladder symptoms.

PHYSICAL THERAPY PROGRESS NOTE
Date: {{T-55}}   Therapist: Mark Ellison, DPT
Visit 4 of 12. Patient reports increased left leg pain and new tingling in left foot. Unable to complete heel walking on left. Therapist notes decline in function since initial evaluation on {{T-69}}. Recommend physician re-evaluation.

RADIOLOGY REPORT — MRI LUMBAR SPINE WITHOUT CONTRAST
Date: {{T-48}}
Impression: Large left paracentral disc extrusion at L4-L5 with severe compression of the traversing left L5 nerve root. Moderate central canal stenosis.

SPINE SURGERY CONSULT
Date: {{T-44}}   Provider: Owen Castillo, MD
Recommendation: Left L4-L5 microdiscectomy, scheduled {{T-30}}, given progressive motor deficit."""

MRI_NOTES = "The MRI showed a large herniated disc and I now have surgery scheduled. My foot was getting weaker every day, my doctor said we couldn't wait 6 weeks."

ER_DENIAL = """BLUE MERIDIAN INSURANCE CO.
Claims Department, 900 Harbor Blvd, Tampa, FL 33602

Date: {{T-28}}

To: Marcus Oyelaran
Member ID: BMI-44017725
Group: Coastal Freight Logistics LLC (employer plan)
Claim #: 26-0402-ER-55190
Provider: St. Agnes Regional Medical Center (out-of-network)
Service: Emergency department visit, level 5 (CPT 99285), CT angiogram chest
Date of Service: {{T-40}}
Billed: $11,860.00

EXPLANATION OF BENEFITS — CLAIM DENIED

Reason: Services were provided by a facility that does not participate in the Blue Meridian network. Your plan does not cover non-emergency services from out-of-network providers. Code NN-12: Out-of-network provider, no referral on file.

You have the right to appeal this decision within 180 days. Submit appeals in writing to Blue Meridian Appeals, PO Box 22190, Tampa, FL 33622. Under ERISA Section 503 you have the right to a full and fair review."""

ER_POLICY = """BLUE MERIDIAN — SUMMARY PLAN DESCRIPTION (EXCERPTS)

ARTICLE 3. EMERGENCY SERVICES
Emergency services are covered in-network and out-of-network without prior authorization. Emergency services provided by an out-of-network facility will be covered at the in-network cost-sharing level. An emergency medical condition is a condition manifesting itself by acute symptoms of sufficient severity, including severe pain, such that a prudent layperson, who possesses an average knowledge of health and medicine, could reasonably expect the absence of immediate medical attention to result in serious jeopardy to health.

ARTICLE 4. OUT-OF-NETWORK SERVICES
Non-emergency services from out-of-network providers are not covered unless a referral has been approved by the Plan.

ARTICLE 8. CLAIMS AND APPEALS
You may appeal an adverse benefit determination within 180 days. The Plan will provide a full and fair review in accordance with ERISA Section 503 and 29 CFR 2560.503-1. Post-service appeals are decided within 60 days.

ARTICLE 9. BALANCE BILLING PROTECTIONS
For emergency services, members are protected from balance billing as required by federal law, including the No Surprises Act."""

ER_RECORDS = """ST. AGNES REGIONAL MEDICAL CENTER — EMERGENCY DEPARTMENT RECORD
Date: {{T-40}}, arrival 02:14
Patient: Marcus Oyelaran, 46M
Chief complaint: Sudden sharp chest pain radiating to back, shortness of breath, began 01:30 while driving on I-75.
Triage: BP 178/104, HR 118, SpO2 93%. ESI level 2.
Workup: ECG without STEMI. Troponin negative x2. CT angiogram chest: no aortic dissection, no pulmonary embolism. Diagnosis: acute chest pain, hypertensive urgency.
Disposition: Discharged 08:40 with antihypertensives, PCP follow-up.
Note: Patient brought by EMS; St. Agnes was the nearest emergency department (4.1 miles)."""

ER_NOTES = "I was driving for work and thought I was having a heart attack or an aortic tear. The ambulance took me to the closest hospital. I had no way to choose an in-network ER."

PA_DENIAL = """CASCADE COMMUNITY HEALTH PLAN
Pharmacy & Medical Benefits

{{T-25}}

Re: Priya Nandakumar   Member ID: CCH-30092251
Claim: 2026-PA-118734
Provider: Mount Rainier Infusion Center
Service: Infliximab infusion (J1745), 3 infusions
Dates of service: {{T-68}}, {{T-54}}, {{T-40}}
Total billed: $18,420.00

DENIAL NOTICE

This claim has been denied because prior authorization was not obtained before the services were provided, as required for specialty infusion medications. Denial code PA-01.

You may appeal within 60 days of this notice by writing to Cascade Appeals, 1500 Pine St, Seattle, WA 98101. Urgent appeals may be requested by your provider."""

PA_POLICY = """CASCADE COMMUNITY HEALTH PLAN — MEMBER HANDBOOK (EXCERPTS)

5.2 PRIOR AUTHORIZATION
Specialty infusion medications require prior authorization. If a service requiring prior authorization is provided without it, the Plan may review the request retrospectively. Retrospective authorization will be granted when the service would have been approved had prior authorization been requested and the provider submits documentation within 90 days of the date of service.

5.3 CONTINUITY OF CARE
Members who were receiving an ongoing course of treatment under a previous health plan at the time of enrollment may continue that treatment for up to 90 days while prior authorization is obtained.

6.1 CROHN'S DISEASE BIOLOGIC THERAPY
Infliximab is covered for moderate-to-severe Crohn's disease after an inadequate response to, or intolerance of, at least one conventional therapy (e.g. corticosteroids, azathioprine, methotrexate).

10.1 APPEALS
Members may appeal within 60 days. Expedited appeals are decided within 72 hours when the standard timeframe could seriously jeopardize the member's health."""

PA_RECORDS = """GASTROENTEROLOGY NOTE — Dr. Helen Park
Date: {{T-75}}
Patient Priya Nandakumar, 34F, with ileocolonic Crohn's disease diagnosed 2019. Failed azathioprine (2020-2022, hepatotoxicity). On infliximab 5 mg/kg q8 weeks since 2023 under prior insurer (Evergreen Health), with sustained remission. New insurance (Cascade) effective {{T-99}}. Next infusion due {{T-68}}. Interruption carries high risk of flare and antibody formation.
Plan: continue infliximab; office to submit PA to new insurer.

INFUSION CENTER NOTE: PA request faxed to Cascade on {{T-73}} (confirmation #F-882173); no response received before the {{T-68}} infusion."""

PA_NOTES = "I switched jobs and insurance a few months ago. My doctor's office faxed the authorization before my first infusion. I've been stable on this drug for 3 years."

SAMPLES = [
    {
        "id": "mri-red-flags",
        "title": "Spine MRI denied — \"not medically necessary\"",
        "blurb": "Skipped 6 weeks of therapy because of a worsening foot drop.",
        "denial": MRI_DENIAL, "policy": MRI_POLICY, "records": MRI_RECORDS, "notes": MRI_NOTES,
        "meta": {"short": "Lumbar spine MRI", "insurer": "Northwind Health Plan", "claim": "CLM-2026-0311-77412",
                 "amount": 2340.0, "category": "medical_necessity", "window": 180, "denied_days_ago": 32},
    },
    {
        "id": "er-out-of-network",
        "title": "Emergency room visit denied — out of network",
        "blurb": "Ambulance took the patient to the nearest ER during suspected heart attack.",
        "denial": ER_DENIAL, "policy": ER_POLICY, "records": ER_RECORDS, "notes": ER_NOTES,
        "meta": {"short": "Emergency room visit", "insurer": "Blue Meridian", "claim": "26-0402-ER-55190",
                 "amount": 11860.0, "category": "out_of_network", "window": 180, "denied_days_ago": 28},
    },
    {
        "id": "infusion-prior-auth",
        "title": "Crohn's infusions denied — no prior authorization",
        "blurb": "New insurance mid-treatment; PA was faxed but never answered.",
        "denial": PA_DENIAL, "policy": PA_POLICY, "records": PA_RECORDS, "notes": PA_NOTES,
        "meta": {"short": "Crohn's infusions (3)", "insurer": "Cascade Community", "claim": "2026-PA-118734",
                 "amount": 18420.0, "category": "prior_authorization", "window": 60, "denied_days_ago": 25},
    },
]


def get_sample(sample_id: str) -> dict | None:
    for s in SAMPLES:
        if s["id"] == sample_id:
            return {k: render_dates(v) if isinstance(v, str) else v for k, v in s.items()}
    return None


def sample_summary(s: dict) -> dict:
    """Card-level facts for the dashboard, with a live deadline."""
    m = s["meta"]
    deadline = ANCHOR - timedelta(days=m["denied_days_ago"]) + timedelta(days=m["window"])
    return {"id": s["id"], "title": s["title"], "blurb": s["blurb"], **m,
            "deadline": deadline.isoformat(), "days_left": (deadline - date.today()).days}
