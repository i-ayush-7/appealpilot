"""Lightweight clause retrieval over the member's policy document (BM25, no external deps).

Policies run to hundreds of pages; sending all of it to every model call is slow and
expensive. We split the policy into clauses, rank them against queries built from the
denial, and pass only the top clauses downstream, each with a stable id the letter cites.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

_WORD = re.compile(r"[a-z0-9]+")
_STOP = set(
    "a an and are as at be by for from has have in is it its of on or that the this to was were will with "
    "you your we our us any all not no may shall must such which who whom been being than then".split()
)
_HEADING = re.compile(r"^\s*((?:section|sec\.?|article|§)\s*[\w.]+|\d+(?:\.\d+)*[.)]?|[A-Z][A-Z \-/&]{6,})\s*", re.I)


@dataclass
class Clause:
    id: str
    title: str
    text: str


def _tokens(text: str) -> list[str]:
    return [w for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 1]


def split_clauses(policy: str, max_chars: int = 900) -> list[Clause]:
    blocks = [b.strip() for b in re.split(r"\n\s*\n", policy or "") if b.strip()]
    clauses: list[Clause] = []
    for block in blocks:
        first = block.splitlines()[0]
        m = _HEADING.match(first)
        title = first[:90] if m else ""
        # Long blocks are cut on sentence boundaries so each clause stays citeable.
        parts, buf = [], ""
        for sentence in re.split(r"(?<=[.;:])\s+", block):
            if len(buf) + len(sentence) > max_chars and buf:
                parts.append(buf.strip())
                buf = ""
            buf += sentence + " "
        if buf.strip():
            parts.append(buf.strip())
        for part in parts:
            clauses.append(Clause(id=f"P{len(clauses) + 1}", title=title, text=part))
    return clauses


def rank(clauses: list[Clause], queries: list[str], k: int = 6) -> list[tuple[Clause, float]]:
    if not clauses:
        return []
    docs = [_tokens(c.title + " " + c.text) for c in clauses]
    n = len(docs)
    avgdl = sum(len(d) for d in docs) / n or 1
    df = Counter(t for d in docs for t in set(d))
    idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
    q = Counter(t for query in queries for t in _tokens(query))
    k1, b = 1.4, 0.75
    scored = []
    for clause, doc in zip(clauses, docs):
        tf = Counter(doc)
        s = 0.0
        for term, qf in q.items():
            if term not in tf:
                continue
            f = tf[term]
            s += idf.get(term, 0) * f * (k1 + 1) / (f + k1 * (1 - b + b * len(doc) / avgdl)) * (1 + math.log(qf))
        scored.append((clause, s))
    scored.sort(key=lambda x: x[1], reverse=True)
    top = [x for x in scored[:k] if x[1] > 0]
    # Always surface appeal-rights clauses: deadlines and process matter for every case.
    for clause, s in scored:
        if len(top) >= k + 2:
            break
        if re.search(r"\bappeal|grievance|external review|reconsideration", clause.text, re.I) and clause not in [c for c, _ in top]:
            top.append((clause, s))
    return top
