import json, urllib.request

system = " ".join([
    "You are the decision module of an autonomous execution agent.",
    "You propose one action; you have NO direct access to memory stores, tools, or ledgers.",
    "Reply with ONLY a JSON object, no prose, no code fences, with fields:",
    '  "proposedAction": object (must include "provider": one of the candidate provider ids)',
    '  "reasoningSummary": string',
    '  "memorySliceIds": array of slice ids you relied on (only ids provided to you)',
    '  "requestedEffects": array of strings chosen ONLY from effects explicitly allowed by the provided influence grants (empty list if none apply)',
])
user = "\n".join([
    "MANDATE: urgency=URGENT, verificationRequired=true, maxLatencySeconds=1800, maxBudgetUsd=20",
    "CANDIDATES:",
    json.dumps({"providerId": "atlas", "costUsd": 12, "expectedLatencySeconds": 3060}),
    json.dumps({"providerId": "beacon", "costUsd": 16, "expectedLatencySeconds": 1500}),
    "MEMORY CONTEXT:",
    "NO MEMORY CONTEXT PROVIDED FOR THIS RUN.",
])
body = json.dumps({
    "model": "llama3.2-1b-8k",
    "temperature": 0,
    "max_tokens": 512,
    "stream": False,
    "response_format": {"type": "json_object"},
    "messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ],
})
for attempt in range(3):
    req = urllib.request.Request(
        "http://127.0.0.1:11434/v1/chat/completions",
        data=body.encode(),
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(req) as res:
        raw = res.read().decode()
    parsed = json.loads(raw)
    choice = parsed["choices"][0]
    print(f"--- attempt {attempt+1} finish={choice.get('finish_reason')} usage={parsed.get('usage')}")
    print("CONTENT:", json.dumps(choice["message"]["content"]))
