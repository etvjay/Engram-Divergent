from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, Mapping
from urllib import error, request

JsonObject = dict[str, Any]
RequestFn = Callable[[str, str, JsonObject | None, Mapping[str, str]], Any]


class EngramHttpError(RuntimeError):
    def __init__(self, message: str, status: int, body: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.body = body


def _default_request(method: str, url: str, body: JsonObject | None, headers: Mapping[str, str]) -> Any:
    payload = None if body is None else json.dumps(body).encode("utf-8")
    req = request.Request(url, data=payload, method=method, headers=dict(headers))
    try:
        with request.urlopen(req) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw
        message = parsed.get("message") if isinstance(parsed, dict) else None
        raise EngramHttpError(message or f"Engram API request failed with {exc.code}", exc.code, parsed) from exc


class Engram:
    def __init__(
        self,
        base_url: str,
        *,
        api_token: str | None = None,
        headers: Mapping[str, str] | None = None,
        request_fn: RequestFn | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        auth_headers = {"authorization": f"Bearer {api_token.strip()}"} if api_token and api_token.strip() else {}
        self._headers = {"content-type": "application/json", **auth_headers, **dict(headers or {})}
        self._request = request_fn or _default_request

    def start_execution(self, **execution: Any) -> "Execution":
        result = self._call("POST", "/v1/executions", execution)
        return Execution(str(result["executionId"]), self)

    def execution(self, execution_id: str) -> "Execution":
        return Execution(execution_id, self)

    def _call(self, method: str, path: str, body: JsonObject | None = None) -> Any:
        return self._request(method, f"{self._base_url}{path}", body, self._headers)


@dataclass(frozen=True)
class Execution:
    id: str
    _client: Engram

    def recall(self, query: str, *, status: list[str] | None = None) -> Any:
        body: JsonObject = {"query": query}
        if status is not None:
            body["status"] = status
        return self._client._call("POST", f"/v1/executions/{self.id}/recall", body)

    def record_decision(
        self,
        *,
        decision_type: str,
        selected_action: JsonObject,
        reasoning_summary: str,
        alternatives: list[JsonObject] | None = None,
        influences: list[JsonObject] | None = None,
    ) -> Any:
        body: JsonObject = {
            "decisionType": decision_type,
            "selectedAction": selected_action,
            "reasoningSummary": reasoning_summary,
        }
        if alternatives is not None:
            body["alternatives"] = alternatives
        if influences is not None:
            body["influences"] = influences
        return self._client._call("POST", f"/v1/executions/{self.id}/decisions", body)

    def observe(
        self,
        *,
        event_type: str,
        payload: JsonObject,
        evidence_state: str,
        provenance: list[JsonObject] | None = None,
    ) -> None:
        body: JsonObject = {
            "type": event_type,
            "payload": payload,
            "evidenceState": evidence_state,
        }
        if provenance is not None:
            body["provenance"] = provenance
        self._client._call("POST", f"/v1/executions/{self.id}/observations", body)

    def complete(
        self,
        *,
        status: str,
        summary: str,
        evidence_state: str,
        result: JsonObject | None = None,
        failure_type: str | None = None,
        admission_signals: list[JsonObject] | None = None,
    ) -> Any:
        body: JsonObject = {
            "status": status,
            "summary": summary,
            "evidenceState": evidence_state,
        }
        if result is not None:
            body["result"] = result
        if failure_type is not None:
            body["failureType"] = failure_type
        if admission_signals is not None:
            body["admissionSignals"] = admission_signals
        return self._client._call("POST", f"/v1/executions/{self.id}/complete", body)

    def trace(self) -> Any:
        return self._client._call("GET", f"/v1/executions/{self.id}/trace")
