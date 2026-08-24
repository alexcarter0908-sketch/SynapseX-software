# General-Purpose Assistant Local Smoke Test

## Local-demo browser check

The refined local-demo assistant was opened at `http://127.0.0.1:3011/assistant`.

The initial reconnect placeholder cleared after the client completed loading. The visible primary interface contained only the expected simple workflow: one large prompt field, Generate button, History, optional **Inspect existing project** control, response workspace, and a local coding-engine status line.

The status correctly reported that Ollama was not reachable on the test machine. This is the required truthful pending state: no website/FastAPI/template implementation was shown or claimed while the general-purpose local model was unavailable. The interface explicitly states that a non-trivial request will not be fabricated and will instead show the pending setup task state.
