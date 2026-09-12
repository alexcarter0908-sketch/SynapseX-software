# SynapseX quality validation matrix

This record describes the representative validation completed for the simplified local Prompt-to-Code Studio. It distinguishes generated proposals from operations that have actually been run on a user-owned target.

| Scenario | Expected behavior | Validation result |
| --- | --- | --- |
| Prompt-only user interface | One large multi-line prompt editor, one direct response surface, and one History control; no normal-use runner, approval, platform-selector, or Builder panel | Verified in local browser preview at `http://127.0.0.1:3013/assistant`. |
| Static website request | Infer a web target and return `index.html`, `styles.css`, `app.js`, local run commands, verification, and download/copy controls | Verified in local browser preview. Starter profile regression coverage passed. |
| Self-improvement request | Return a read-only workspace inspection script, validation commands, a reviewed-change workflow, and no automatic self-edit claim | Verified in local browser preview and universal-contract tests. |
| Response history | Keep the prior generated responses locally, let the user reopen a response, and provide a clear-history action | Verified in local browser preview. Local history is browser-local and non-authoritative. |
| Local demo authentication | Avoid hosted OAuth, use an explicit non-production Local Demo identity, and avoid database persistence for Builder/chat | Covered by server and browser validation. |
| Unsafe bypass request | Refuse unauthorized access, lock bypass, credential theft, root/jailbreak, malware, and disabling endpoint protection | Covered by regression tests for blocked security patterns. |
| Authorized defensive security request | Return read-only baseline/preflight material first, preserving explicit confirmation, backup/recovery, and review requirements for any high-impact change | Covered by universal-contract regression tests. |
| Broad systems concept | Return a design and safety-validation package for authorized command-center, device, or vehicle automation concepts without claiming physical-system operation | Covered by universal-contract regression tests. |

## Test commands run in this workspace

```text
pnpm test
pnpm check
pnpm build
```

The test suite and TypeScript check pass in both ordinary development conditions and explicit local-demo mode. The production build completes successfully. The build tool reports large client chunks from syntax/highlighter dependencies; this is a performance optimization item, not a failed build.

## Not verified

No generated website, API, security configuration, hardware design, external deployment, or physical device operation is represented as completed until the user runs its own verification steps on an authorized target and records the results.
