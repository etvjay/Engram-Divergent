# Engram live deployment runbook

Status labels in this document are deliberate. Do not mark a step VERIFIED until its corresponding command, workflow, or deployed endpoint has been exercised.

## Required external resources

- CockroachDB Cloud cluster with a database for Engram.
- CockroachDB SQL connection string (`DATABASE_URL`).
- AWS account with Lambda/API Gateway deployment rights.
- Amazon Bedrock access to `amazon.titan-embed-text-v2:0` (or the configured embedding model) in the deployment region.
- CockroachDB Cloud Managed MCP credentials for the canonical hackathon live proof.
- A strong random `ENGRAM_API_TOKEN` for all non-demo `/v1` API routes.

## CockroachDB

Do not apply one migration file manually. Engram has an ordered migration chain for runtime policy, evaluation, atomic event sequencing, and the canonical agent-scoped cosine vector index.

Apply the full chain with:

```bash
DATABASE_URL='postgresql://...' npm run migrate
```

Then run the credential-gated integration suite:

```bash
DATABASE_URL='postgresql://...' npm run test:integration
```

The database suite covers persisted memory/influence provenance plus concurrency, idempotency, and agent-isolation properties. A normal credential-free CI run only proves that these tests compile and are correctly gated; it does **not** constitute live CockroachDB verification.

## Canonical live verification

The repository has one canonical manual workflow:

`.github/workflows/live-verification.yml`

It requires CockroachDB, AWS/Bedrock, and Managed MCP credentials. The verifier:

1. applies the complete migration chain;
2. runs the EngramRuntime Run A → memory → Run B causal spine;
3. verifies persisted recall exposure and accepted influence provenance;
4. uses Amazon Bedrock Titan embeddings and records provider/model/region/dimensions;
5. runs `EXPLAIN` against the **exact persisted Run B retrieval query and filters**;
6. records whether CockroachDB naturally selected `memories_agent_embedding_cosine_idx`;
7. queries the exact memory provenance through Managed MCP;
8. writes `evidence/live/latest.json` on success **or** a sanitized UNKNOWN failure artifact on failure.

External multi-venue execution remains **SIMULATED** in this workflow.

C-SPANN index usage is a separate evidence boundary from successful vector-distance retrieval. If the natural plan does not show vector search using the expected agent-scoped cosine index, the artifact must leave C-SPANN usage UNVERIFIED.

## Managed MCP

CockroachDB Cloud's managed MCP endpoint is:

`https://cockroachlabs.cloud/mcp`

Engram uses:

```bash
COCKROACH_MCP_CLUSTER_ID='...'
COCKROACH_MCP_API_KEY='...'
COCKROACH_MCP_URL='https://cockroachlabs.cloud/mcp'
COCKROACH_MCP_DATABASE='defaultdb'
```

Transactional Engram writes continue through the PostgreSQL-compatible application connection. Managed MCP is a read/introspection/provenance plane.

Never store the MCP API key inside an execution event, memory, decision, trace, or frontend bundle.

## API authentication

`GET /health` and the deterministic `POST /v1/demo/run` proof endpoint are intentionally public.

Every other `/v1/*` request requires:

```bash
Authorization: Bearer $ENGRAM_API_TOKEN
```

This includes runtime lifecycle writes, runtime traces, legacy memory search, control-plane reads, and MCP inspection routes. The API fails closed with `API_AUTH_NOT_CONFIGURED` when no server token exists, and returns `UNAUTHORIZED` for a missing/incorrect bearer token.

The TypeScript HTTP transport supports:

```ts
httpTransport({
  baseUrl: API_URL,
  apiToken: process.env.ENGRAM_API_TOKEN,
});
```

The Python SDK supports:

```python
Engram(API_URL, api_token=os.environ["ENGRAM_API_TOKEN"])
```

This shared token is an initial deployment boundary, not a complete tenant/user identity system. A production multi-user control plane should move to authenticated sessions/identity-aware authorization rather than shipping this token in a public browser bundle.

## AWS SAM

Credential-free packaging is checked by `.github/workflows/sam-build.yml` using the project-pinned `esbuild` binary and `sam build`. The workflow deliberately does not use `sam validate` as its credential-free proof boundary because validation can depend on AWS configuration.

Build locally:

```bash
npm install
export PATH="$PWD/node_modules/.bin:$PATH"
sam build
```

Deploy:

```bash
sam deploy --guided \
  --parameter-overrides \
    DatabaseUrl='postgresql://...' \
    CorsOrigin='https://YOUR_FRONTEND' \
    ApiToken='A_LONG_RANDOM_SECRET' \
    CockroachMcpClusterId='YOUR_CLUSTER_ID' \
    CockroachMcpApiKey='YOUR_SERVICE_ACCOUNT_KEY' \
    CockroachMcpDatabase='defaultdb'
```

`ApiToken` is passed to Lambda as `ENGRAM_API_TOKEN`.

The repository also contains the manual `.github/workflows/aws-deploy-verification.yml` workflow. It builds and deploys the SAM stack, resolves the deployed API URL, proves an unauthenticated `/v1` call is rejected, then exercises the authenticated trace, control plane, memory evaluation, MCP status, and MCP provenance endpoints. It writes an `evidence/aws/` artifact.

## Deployment verification sequence

After deployment, exercise at minimum:

```bash
curl "$API_URL/health"

curl -X POST "$API_URL/v1/demo/run"

curl -H "Authorization: Bearer $ENGRAM_API_TOKEN" \
  "$API_URL/v1/control-plane/overview"

curl -H "Authorization: Bearer $ENGRAM_API_TOKEN" \
  "$API_URL/v1/mcp/status"
```

A deployed API claim is not VERIFIED until these public/authenticated surfaces have been exercised successfully against the deployed Lambda.

## Web UI

Build with the deployed API URL:

```bash
VITE_API_BASE_URL="$API_URL" npm run build:web
```

The output is written to `dist-web/`. Do **not** embed `ENGRAM_API_TOKEN` into a public static frontend bundle. A protected operator/control-plane frontend needs a server-side authenticated session architecture or another identity-aware proxy.

## Evidence boundary

The canonical demo/submission must state independently:

- external venue execution: **SIMULATED**
- CockroachDB persistence: **VERIFIED** only after credentialed live proof
- vector-distance retrieval: **VERIFIED** only after credentialed live proof
- C-SPANN cosine index selection: **VERIFIED** only when the natural EXPLAIN plan proves it
- Bedrock embeddings: **VERIFIED** only after a live Titan invocation
- memory-to-decision provenance: **VERIFIED** only after live persisted trace proof
- Managed MCP: **VERIFIED** only after live connection and exact provenance query
- SAM packaging: **TESTED** only after SAM Build CI succeeds
- AWS deployment: **VERIFIED** only after the deployed public/authenticated endpoints are exercised

Do not upgrade any label based only on configuration, schema presence, or normal credential-free CI.
