# Evaluation Truth — Sibyl Labs Hackathon

Verified: 2026-08-24
Canonical sources: https://hack.sibyllabs.org/ ; /rules ; /submissions ; Sibyl docs.

## Program
- Registration: Aug 16–31, 2026, closes 23:59 UTC.
- Build window: Sep 1–10, 2026.
- Judging: Sep 11–12.
- Winners: Sep 13–15.
- Prize pool: $10,000 USDC across top five.

## Eligibility gate — PUBLISHED_HARD
Sibyl Memory must be load-bearing. Judges apply the deletion test: remove Sibyl Memory; if the product still does what it claims, it fails.

Required proof:
1. persist context that matters;
2. recall it in a genuinely fresh session;
3. use it to change a decision, action, or result;
4. cold-start recall shown in one continuous unedited demo segment with on-screen timestamp or commit hash;
5. README points judges to critical write/read calls discoverable in under two minutes.

## Rubric — PUBLISHED_SCORING
- Memory load-bearing / sophistication: 40
- Innovation & originality: 25
- Technical execution: 20
- Pitch & presentation: 15
- PMF bonus: up to +10, only with publicly verifiable evidence.

Top memory band favors coordination and dynamic-storage patterns over trivial notepad recall.

## Partner multiplier — PUBLISHED_BONUS
- 0 verified stacks: ×1.00
- 1 verified stack: ×1.15
- 2 verified stacks: ×1.25 cap

Base qualifies when product deployment exists and the demo exercises a real onchain action such as wallet operation, x402 payment, B20 read or contract interaction.

Virtuals qualifies when the demo exercises an ACP job, registered/transacting agent or another Virtuals-native integration.

Decorative/import-only integrations do not count.

## Submission — PUBLISHED_HARD
- Public GitHub repo under MIT or Apache-2.0 with real commit history.
- 2–5 minute demo.
- README with setup/run instructions, load-bearing memory explanation, partner stack locations, 'how memory made this possible', and Prior Work declaration.
- Two public posts: demo video + at least one build log, tagging Sibyl and claimed partners.
- Submission through registered team's private build page before Sep 10, 23:59 UTC.

## Engram-specific conservative rule
The judged hackathon profile must not contain an equivalent CockroachDB decision-memory fallback. CockroachDB may remain part of canonical Engram outside this profile, but the submitted Sibyl path must fail the load-bearing function when Sibyl is removed.

## Unknowns
- Exact Sibyl package/API version to lock at implementation start.
- Exact partner workshop guidance that may change preferred Base/Virtuals integration shape.
- Whether an existing repo with substantial prior work is advantaged/disadvantaged beyond mandatory Prior Work declaration; no penalty is published.

Re-run this truth freeze before `READY_FOR_SUBMISSION`.
