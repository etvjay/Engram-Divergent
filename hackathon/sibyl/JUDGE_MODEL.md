# Judge Model

## Judge questions Engram must answer fast

1. What is Engram?
2. Why is Sibyl necessary rather than decorative?
3. What exact memory was persisted?
4. Is the second run genuinely fresh?
5. What changed because of recalled memory?
6. Can I delete Sibyl and make the claimed behavior fail?
7. Is this more than generic RAG/chat memory?
8. Can I trace source execution -> memory -> recall -> influence -> changed action?
9. Does it survive a second comparable run?
10. Are Base/Virtuals doing product work or sponsor theater?

## Evaluator personas

### Cold product evaluator
Needs a 20-second explanation: Engram turns prior execution experience into operational memory that changes future autonomous behavior.

### Memory skeptic
Attempts deletion test; compares fresh-session run with and without Sibyl; rejects retrieval without behavioral influence.

### Evidence skeptic
Checks provenance, commit hash/timestamp, decision record, memory write/read paths and counterfactual baseline.

### Adversarial operator
Injects stale, incompatible, contradictory or wrong-provenance memory and expects Engram policy to block or expose it.

### Partner specialist
Requires protocol-native evidence for each claimed partner and checks it is exercised during the demo.

## Winning evaluator moment
A fresh process starts with no in-process state, recalls a prior failed execution through Sibyl, Engram marks the memory eligible, the application selects a different action than the memory-free control, and the trace shows exactly why.
