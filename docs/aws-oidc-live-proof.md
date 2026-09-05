# AWS OIDC setup for Engram live verification

Engram's Bedrock live proof uses GitHub Actions OIDC to obtain short-lived AWS credentials. Do not create long-lived IAM user access keys for the workflow.

## Canonical live profile

- Repository: `etvjay/Engram`
- GitHub owner ID: `315516498`
- GitHub repository ID: `1335146634`
- Trusted branch: `main`
- GitHub OIDC issuer: `https://token.actions.githubusercontent.com`
- OIDC audience: `sts.amazonaws.com`
- AWS region: `us-west-2`
- Bedrock model: `amazon.titan-embed-text-v2:0`
- Embedding dimensions: `1024`
- Required GitHub secret after setup: `AWS_ROLE_ARN`
- Required GitHub secret for the causal proof: `DATABASE_URL`

The Engram repository was created after GitHub's 2026-07-15 immutable OIDC-subject rollout. The AWS trust policy therefore uses the immutable subject:

```text
repo:etvjay@315516498/Engram@1335146634:ref:refs/heads/main
```

`us-west-2` is the selected live region because the account path successfully invoked Titan Text Embeddings V2 there and returned a 1024-dimensional embedding. `us-east-1` throttling is not treated as a product failure.

## 1. Open AWS CloudShell

Run the following as an AWS identity that can create IAM OIDC providers, roles, and role policies.

```bash
set -euo pipefail

export AWS_REGION="us-west-2"
export ROLE_NAME="EngramGitHubLiveVerification"
export GITHUB_OIDC_SUB='repo:etvjay@315516498/Engram@1335146634:ref:refs/heads/main'
export ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export OIDC_PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
export ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

printf 'AWS account: %s\nRole ARN: %s\n' "$ACCOUNT_ID" "$ROLE_ARN"
```

## 2. Create the GitHub OIDC provider if it does not already exist

```bash
if aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn "$OIDC_PROVIDER_ARN" >/dev/null 2>&1; then
  echo "GitHub OIDC provider already exists"
else
  aws iam create-open-id-connect-provider \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com"
fi
```

## 3. Create the role trust policy

The trust is intentionally scoped to the canonical Engram repository and `main` branch. This prevents a workflow in another repository or another Engram branch from assuming the live-verification role.

```bash
cat > "$HOME/engram-github-trust.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "${OIDC_PROVIDER_ARN}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "${GITHUB_OIDC_SUB}"
        }
      }
    }
  ]
}
JSON
```

Create or reconcile the role:

```bash
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-document "file://$HOME/engram-github-trust.json"
else
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --description "Least-privilege GitHub OIDC role for Engram Bedrock live verification" \
    --assume-role-policy-document "file://$HOME/engram-github-trust.json"
fi
```

## 4. Attach the least-privilege Bedrock invocation policy

Resolve the model ARN from AWS:

```bash
export MODEL_ARN="$(aws bedrock get-foundation-model \
  --region "$AWS_REGION" \
  --model-identifier amazon.titan-embed-text-v2:0 \
  --query 'modelDetails.modelArn' \
  --output text)"

echo "$MODEL_ARN"
```

Expected shape:

```text
arn:aws:bedrock:us-west-2::foundation-model/amazon.titan-embed-text-v2:0
```

Create the inline role policy:

```bash
cat > "$HOME/engram-bedrock-policy.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeEngramEmbeddingModel",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "${MODEL_ARN}"
    }
  ]
}
JSON

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "EngramTitanEmbeddingInvoke" \
  --policy-document "file://$HOME/engram-bedrock-policy.json"
```

No broad Bedrock admin, IAM admin, S3, EC2, or general AWS permissions are required by the live verifier.

## 5. Verify the resulting role configuration

```bash
aws iam get-role \
  --role-name "$ROLE_NAME" \
  --query 'Role.[Arn,AssumeRolePolicyDocument]' \
  --output json

aws iam get-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "EngramTitanEmbeddingInvoke" \
  --output json

echo "AWS_ROLE_ARN=$ROLE_ARN"
```

## 6. Configure GitHub

In `etvjay/Engram`:

`Settings -> Secrets and variables -> Actions`

Create repository secret:

```text
AWS_ROLE_ARN=arn:aws:iam::<ACCOUNT_ID>:role/EngramGitHubLiveVerification
```

Create repository variable:

```text
AWS_REGION=us-west-2
```

`BEDROCK_EMBEDDING_MODEL` is optional. The workflow defaults it to:

```text
amazon.titan-embed-text-v2:0
```

The full live causal proof also requires:

```text
DATABASE_URL=<CockroachDB Cloud connection string>
```

Do not paste that URL into issues, logs, documentation, or chat output.

## 7. Run the canonical proof

After `AWS_ROLE_ARN` and `DATABASE_URL` are configured, dispatch:

`Actions -> Engram Live Verification -> Run workflow`

Choose:

```text
embedding_provider = bedrock
```

The workflow must first obtain short-lived AWS credentials through GitHub OIDC, print only the assumed caller ARN, build Engram, and then execute the credentialed Cockroach causal-spine verifier.

The target evidence chain is:

```text
Execution A
  -> outcome
  -> Operational Memory
  -> Titan 1024d embedding
  -> Cockroach persistence
  -> vector retrieval
  -> persisted recall
  -> fresh runtime
  -> Decision B
  -> explicit influence trace
  -> evidence/live/latest.json
```

## Evidence classification

A successful manual Titan invocation proves the AWS account can invoke the model in `us-west-2`; it does not by itself prove GitHub OIDC, Cockroach persistence, or the complete Engram causal spine.

Promote those boundaries only from the credentialed GitHub Actions run and its sanitized evidence artifact. Missing credentials, throttling, or unavailable dependencies remain `UNKNOWN` or `UNVERIFIED`; they must not be silently promoted to `VERIFIED`.
