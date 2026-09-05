import unittest

from engram import Engram


class FakeTransport:
    def __init__(self):
        self.calls = []
        self.execution_id = "11111111-1111-4111-8111-111111111111"

    def __call__(self, method, url, body, headers):
        self.calls.append((method, url, body, dict(headers)))
        if url.endswith("/v1/executions"):
            return {"executionId": self.execution_id}
        if url.endswith("/recall"):
            return {"recall": {"id": "r1", "executionId": self.execution_id, "candidates": []}, "candidates": [], "rejected": []}
        if url.endswith("/decisions"):
            return {"id": "d1", "executionId": self.execution_id, "influences": []}
        if url.endswith("/observations"):
            return {"ok": True}
        if url.endswith("/complete"):
            return {"executionId": self.execution_id, "admittedMemories": [], "rejectedSignals": []}
        if url.endswith("/trace"):
            return {"execution": {"id": self.execution_id}}
        raise AssertionError(f"unexpected URL {url}")


class EngramClientTests(unittest.TestCase):
    def test_execution_scopes_lifecycle_calls(self):
        transport = FakeTransport()
        client = Engram("https://engram.example/", request_fn=transport)
        execution = client.start_execution(
            agentId="python-agent",
            workflowType="deployment",
            intent="Deploy safely",
            context={"service": "api"},
            constraints={},
        )

        execution.recall("prior failures")
        execution.record_decision(
            decision_type="STRATEGY",
            selected_action={"strategy": "safe"},
            reasoning_summary="Application selected the action.",
        )
        execution.observe(event_type="STARTED", payload={}, evidence_state="OBSERVED")
        execution.complete(status="SUCCESS", summary="done", evidence_state="OBSERVED")
        execution.trace()

        self.assertEqual(execution.id, transport.execution_id)
        paths = [call[1].replace("https://engram.example", "") for call in transport.calls]
        self.assertEqual(
            paths,
            [
                "/v1/executions",
                f"/v1/executions/{transport.execution_id}/recall",
                f"/v1/executions/{transport.execution_id}/decisions",
                f"/v1/executions/{transport.execution_id}/observations",
                f"/v1/executions/{transport.execution_id}/complete",
                f"/v1/executions/{transport.execution_id}/trace",
            ],
        )

    def test_api_token_adds_bearer_header(self):
        transport = FakeTransport()
        client = Engram("https://engram.example", api_token="python-secret", request_fn=transport)
        client.start_execution(
            agentId="python-agent",
            workflowType="deployment",
            intent="Deploy safely",
            context={},
            constraints={},
        )
        self.assertEqual(transport.calls[0][3]["authorization"], "Bearer python-secret")


if __name__ == "__main__":
    unittest.main()
