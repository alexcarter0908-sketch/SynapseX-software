# Assistant Viewport Verification

Trusted desktop verification at 1280×720 confirms the route header begins at the visible top of the managed preview, the Assistant panel occupies the available viewport, the message history is contained within the chat surface, and the textarea plus send button remain visible at the bottom.

Trusted mobile verification at 390×844 confirms the mobile navigation header, Assistant heading, chat surface, suggestion prompts, textarea, and send button are all visible without requiring outer page scrolling. The layout uses a visible header, an independently scrollable chat history region, and a shrink-resistant composer.

TypeScript validation passed after the layout rewrite. Full Vitest validation remains to be run before checkpoint delivery.
