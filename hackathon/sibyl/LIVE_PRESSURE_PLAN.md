# Live Pressure Plan

## P0 mutations — must detect failure

1. **Delete/disable Sibyl write**
   - Expected: no future cross-session operational memory.
   - Gate: core flagship behavior cannot reproduce.

2. **Delete/disable Sibyl recall**
   - Expected: fresh session behaves like no-memory control.
   - Gate: changed-action proof disappears.

3. **Kill process between runs**
   - Expected: Run B still recalls through Sibyl.
   - Detects accidental in-process/session caching.

4. **Inject stale/incompatible memory**
   - Expected: Engram eligibility blocks influence.

5. **Inject wrong-provenance memory**
   - Expected: rejected or explicitly surfaced as invalid provenance.

6. **Inject contradictory memories**
   - Expected: conflict remains visible; no silent overwrite/adjudication.

7. **Repeat flagship scenario twice**
   - Expected: deterministic invariants remain stable; no one-shot demo behavior.

## Evaluator runs

### Cold evaluator
Clone, install, run, locate write/read paths, execute flagship scenario without guidance.

### Memory skeptic
Run memory-enabled, no-memory control, and deletion mutation; compare decisions and outputs.

### Evidence skeptic
Reconstruct source execution -> memory ID -> recalled candidate -> influence record -> changed action.

### Dependency degradation
Make Sibyl unavailable after prior persistence; product must fail legibly rather than silently switch to equivalent hidden persistence.

### Partner specialist
If Base/Virtuals claimed, verify protocol-native transaction/job evidence and confirm it serves the actual remembered decision.

## Promotion rule
`LOCAL_PASS` cannot become `LIVE_PASS` from screenshots or simulated fixtures. Public/evaluator claims require observed public evidence.
