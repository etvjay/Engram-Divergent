# Two-stage Cockroach retrieval

Engram's CockroachDB retrieval uses two stages so the agent-scoped cosine C-SPANN index can perform candidate generation without giving up the canonical validity, workflow, environment, source-outcome, and evidence semantics.

1. Candidate generation: `WHERE agent_id = $agent ORDER BY embedding <=> $query LIMIT $candidateLimit`.
2. Canonical filtering/scoring: join only those candidate memory IDs to `memory_sources` and `outcomes`, apply validity/workflow/environment/status filters, then compute Engram hybrid scores and return the requested limit.

The candidate limit is deliberately larger than the result limit. It defaults to `max(limit * 8, 64)` and is capped at 400. It can be overridden with `ENGRAM_VECTOR_CANDIDATE_LIMIT` for live benchmarking.

Evidence discipline:
- C-SPANN candidate generation is a database/query-plan claim.
- Final recall must be compared against an exhaustive query with the *same canonical filters*, not against a looser agent-only vector baseline.
- The scale fixture vectors remain deterministic synthetic benchmark data; they do not prove semantic embedding quality.
- Agent isolation remains mandatory: a candidate from another agent is never eligible for Stage 2.
