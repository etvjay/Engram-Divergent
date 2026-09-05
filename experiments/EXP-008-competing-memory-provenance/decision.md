# EXP-008 Decision

## Decision

**ACCEPTED.**

Engram treats the retrieval that exposed a memory as first-class provenance on every claimed memory influence.

## Invariant

`memory influence → exact retrieval → exact exposed memory`

Execution-level recall membership is not sufficient.

## Failure behavior

A provenance mismatch must:

- fail with `RETRIEVAL_MISMATCH`;
- prevent persistence of the invalid decision;
- retain an `INFLUENCE_REJECTED` evaluation where supported;
- never silently substitute a different retrieval.

## Evidence

Accepted from the passing Engram CI suite containing `tests/runtime/competing-memory-provenance.test.ts`, including combined run `31935273665`.

## Boundary

This establishes the runtime/protocol invariant. Credentialed CockroachDB trace reconstruction remains separately live-verification-gated.
