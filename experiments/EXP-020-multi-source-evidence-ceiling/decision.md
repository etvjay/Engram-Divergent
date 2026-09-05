# EXP-020 — Decision

**Status: ACCEPTED**

Accept the conservative multi-source evidence ceiling.

Every execution named in `sourceExecutionIds` is asserted by the admission contract to supply evidence supporting the derived Operational Memory. Therefore the memory's `evidenceState` must not exceed the evidence state of any declared supporting source outcome.

The admitting execution is already bounded by EXP-017. For additional historical sources, Engram resolves the persisted outcome evidence state and rejects admission when the requested memory evidence rank exceeds it. If a historical source outcome cannot be resolved, admission fails closed rather than manufacturing evidence authority.

This is recorded architecturally as D-025.
