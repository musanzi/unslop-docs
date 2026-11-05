# 13: Animate upload, editing, and completion states

## What to build

The workspace animates a document's upload, editing, and completion, so a user can see work happening. Users who ask their system for reduced motion get the same information without movement.

## Acceptance criteria

- [ ] The upload state, the editing state, and the transition to completed each have an animation in the sidebar entry and the main panel.
- [ ] The completion animation plays once when a document completes while the user is watching. It does not replay on reload or when the user opens an older entry.
- [ ] With `prefers-reduced-motion: reduce`, no element moves, pulses, or loops. Static indicators show the same states.
- [ ] Each state has visible text, so color and motion never carry the meaning alone.
- [ ] A polite live region announces state changes once each, and animation frames produce no announcements.
- [ ] Animations do not shift the layout of the sidebar or the main panel, and they work at phone width.
- [ ] Server rendering of the workspace works with no browser-only animation errors.
- [ ] Failed states show without a celebratory or looping animation.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] The pull request includes a recording of a full run, and a recording or screenshots with reduced motion on.

## Blocked by

- 07: Unslop a document into a revised DOCX
