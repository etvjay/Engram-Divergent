# Engram REST surface

This module provides a versioned HTTP adapter over the existing bounded agent
surface. It is intended for local loopback use; it does not provide hosted
deployment or authentication.

## Routes

- `GET /v1/health` — read; reports `LOCAL_LOOPBACK` evidence.
- `GET /v1/capabilities` — read; returns the allowlisted route/classification matrix.
- `POST /v1/executions/complete` — write; delegates to `record_complete_execution`.
- `POST /v1/memories/recall` — read; delegates to `recall_applicable_memory`.
- `POST /v1/influence/requests` — write; delegates to `request_influence`.
- `POST /v1/outcome-evaluations` — write; delegates to `submit_outcome_evaluation`.
- `GET /v1/evaluations/summary` — read; delegates to `get_evaluation_summary`.
- `GET /v1/evaluations/arms` — read; delegates to `compare_arms`.
- `GET /v1/evaluations/scorecard` — read; delegates to `get_use_case_scorecard`.

JSON request bodies are capped at 1 MiB and responses at 1 MiB. Every response
contains a generated or validated `requestId` and `x-request-id` header. Errors
use `{ error: { code, message }, requestId }`; internal errors never expose
upstream messages. Unknown routes, malformed JSON, wrong content types, and
schema violations are rejected. The adapter does not expose raw Sibyl records,
secrets, wallets, ACP writes, or arbitrary proxy paths.
