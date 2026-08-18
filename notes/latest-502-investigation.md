# Latest 502 investigation

On 2026-08-18, the user reported the Assistant disappeared after Console output showed a duplicate Meta Pixel warning, `editor.main.js:122 Uncaught (in promise) Canceled`, and `3000.../manus/logs:1` HTTP 502.

App-owned dev logs show the server is currently running on localhost:3000. The only app-side transform error in the log is stale historical output from 09:49:26 for `server/routers.ts`; subsequent restarts at 09:49:41, 09:54:42, and 10:17:39 completed successfully. No current SynapseX runtime exception or `/manus/logs` route exists in project source.

Direct preview at `/assistant` outside the management editor rendered the SynapseX Command Center, restored chat, multiple collapsible `Terminal Output` messages, file download controls, textarea composer, and `Build inside Assistant`. Therefore the supplied 502/cancellation evidence is consistent with external preview/editor infrastructure; exact wrapper unmount/blank transition remains NOT VERIFIED.

After a managed dev-service restart, the server log showed a transient exit during restart followed by a clean startup at 10:22:33 with `Server running on http://localhost:3000/`. Direct `/assistant` navigation at 10:22:46 again rendered the command center, restored content, Terminal Output summaries, download buttons, textarea, and Build panel. This validates app reachability after restart but does not reproduce or fix the management wrapper's `/manus/logs` 502.
