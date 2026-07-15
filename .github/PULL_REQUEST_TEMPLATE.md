<!--
PR description template — keep it concise. A reviewer should grasp the change
without opening the diff. Delete any section that doesn't apply, and delete
these comments before submitting. Full rules: plugin-coding-conventions skill →
"Pull requests".

No AI/assistant attribution anywhere — no "Generated with …" footer here, and no
Co-Authored-By/session trailers in commits (plugin-coding-conventions →
"No AI / assistant attribution").

Title (set above, not here): Conventional Commit — `<type>: <imperative summary>`
(feat / fix / feat! / chore / docs / ci / test / refactor). The type drives the
release (feat → minor, fix → patch, feat! → major, others → none). Squash-merged,
so the title becomes the released commit message. When delivering a plugin-architect
plan, mirror that plan's PR title field.
-->

## What & why

<!--
One short paragraph. Describe the change and the reason for it — not the files
touched (the diff already shows those).

If this delivers a plugin-architect plan (.claude/plans/<date>-<slug>.md),
link it and summarize its Context (why) + what's delivered. Point to the plan;
don't restate it.

If there's no plan, a couple of sentences of what changed and why is enough.
-->

## Verification

<!--
The checks you ran. At minimum the gate:
`npm run typecheck && npm run lint && npm test`
Plus any live `npm run watch` check against a real/known device, and note what's
still pending (e.g. manual on-device verification). Skip anything obvious.
-->

- [ ] `npm run typecheck && npm run lint && npm test` green
</content>
