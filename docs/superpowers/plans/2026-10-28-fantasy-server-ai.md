# Fantasy server AI repair plan

> For agentic workers: execute the scoped tasks below with regression tests and an independent review. The user requested implementation, verification and a PR.

**Goal:** supply the missing production inference process and private endpoint so NPC/GM free dialogue has a working server fallback after deployment.

**Architecture:** a small Node 24 init container verifies or streams the pinned Qwen3 1.7B model into a dedicated volume. A digest-pinned official llama.cpp CPU container reads that volume and exposes only its internal OpenAI API. Tonarium starts independently and uses the private service name; no inference port is published to the host.

**Decisions:** reuse the existing Qwen3 1.7B Q8_0 model/revision/hash rather than introduce another model. Default to two CPU threads and a 3 GiB inference memory ceiling; guard initial model provisioning when host MemAvailable is below 2304 MiB. These defaults are operator-adjustable because the user does not know the production server specifications. The guard is a snapshot, not a guarantee against later resource exhaustion.

**Constraints:** preserve existing gameplay, data, authentication, LiveKit and the Windows development launcher. No changelog edits. Never copy the unrelated gameplay changes from E:/tonarium2. Do not download or start a real model on the user's PC. Actual container inference is exercised on a CI runner if available, with synthetic prompts only. Do not merge or deploy the PR.

## Tasks

- [x] Provisioning: add scripts/fantasy-ai-model.mjs and tests for verified cache reuse, streaming bounds, hash/size failure, cancellation, atomic replacement, disk and startup memory checks. Add Dockerfile.fantasy-ai-model with an unprivileged user.
- [x] Deployment: add model-init and CPU inference services, private endpoint/model environment forwarding, read-only runtime model volume, resource ceilings and readiness healthcheck. Do not make Tonarium readiness depend on the model download.
- [x] Verification runner: implement the bounded Compose smoke check for actual health, alias and synthetic Korean/English/Japanese completions. Fixture tests pass; actual execution awaits PR CI.
- [x] Desktop fallback: review and bring in the three-file sampling regressions; retain memory and genuine overload protections. Browser AI tests pass.
- [x] Documentation: document first download, resource requirements/limits, logs and operator checks. Preserve untested production hardware as an explicit limitation.
- [ ] Finish: run relevant tests plus check:completion, review exact diff, commit only this task, push the codex branch to the user's fork, create and attach the develop PR, and inspect its checks. Report any validation requiring operator action honestly.

## Review focus

Model-init corruption or interruption must not publish an incomplete model. Cached models must work without a new network request. Missing model or insufficient hardware must not block Tonarium's own readiness. Resource limits must be explicit and adjustable. Readiness must use an executable present in the pinned image. Compose and CI must use the same model and internal port. No credentials, player messages or model weights belong in the PR.
