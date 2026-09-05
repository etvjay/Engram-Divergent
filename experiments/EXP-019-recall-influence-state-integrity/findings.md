# EXP-019 Findings

**Status:** ACCEPTED

## Result

EXP-019 establishes recall-to-influence memory state integrity for the current Engram Operational Memory model.

A recall now persists a versioned digest of the authority-relevant memory state that was actually exposed. Before a later decision can claim influence, the runtime reloads the current memory, recomputes the digest, and requires it to match the persisted recall binding.

The canonical digest namespace is `engram.memory-state/v1:sha256:<digest>` and canonicalization is stable across equivalent object-key ordering.

## Adversarial evidence

The accepted suite proves:

- unchanged recalled state remains influential after runtime reconstruction;
- summary mutation fails closed;
- structured-context mutation fails closed;
- confidence mutation fails closed;
- evidence-state mutation fails closed;
- validity metadata mutation fails closed;
- tool-version mutation fails closed;
- policy-version mutation fails closed;
- a persisted legacy recall with no state binding remains readable but cannot support a new influence claim;
- rejected state-mismatch influence persists no decision and emits `INFLUENCE_REJECTED`;
- canonical JSON key ordering does not create a false state mismatch;
- authority-relevant content changes produce a different digest;
- the digest carries an explicit version namespace.

## Persistence evidence

Cockroach runtime reconstruction now reads and writes `memory_state_digest` on `memory_retrieval_results`. Historical in-memory test stores were also migrated to preserve the same binding, ensuring the repository does not depend on a warm `EngramRuntime` process for this guarantee.

The initial full-suite run `31947220066` failed closed because legacy test stores discarded the new binding. That run is retained as negative engineering evidence and was not used for acceptance.

After migrating those stores without weakening the invariant, full **Engram CI `31947418007` passed** on the branch with the complete EXP-019 implementation and canonicalization tests.

## Boundary

This experiment binds the Operational Memory object state exposed by recall. It does not prove that every external fact referenced by that memory is immutable, and it does not replace provenance, ownership, lifecycle, evidence-state, policy, contradiction, or counterfactual validation.

Credentialed CockroachDB Cloud execution remains separately live-verification-gated; this experiment is TESTED runtime/storage-contract evidence, not a LIVE VERIFIED cloud claim.
