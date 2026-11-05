# GitHub issue tracker

Issues and specs live at https://github.com/musanzi/unslop-docs/issues.
Use the `gh` CLI with `--repo musanzi/unslop-docs`.

## Issue operations

- Create issues with `gh issue create`. Pass multiline bodies through `--body-file`.
- Read issues with `gh issue view <number> --json number,title,body,labels,comments`.
- List open issues with `gh issue list --state open`.
- Change labels with `gh issue edit <number> --add-label` or `--remove-label`.
- Record the resolution before closing an issue with `gh issue close`.

When a skill asks to publish to the tracker, create a GitHub issue.
When a skill asks to fetch a ticket, read the referenced GitHub issue.

## Relationships

Use native sub-issues and dependencies when available.
Otherwise, record `Part of #<parent>` and `Blocked by: #<number>` in the issue body.
An issue is unblocked when all blocking issues are closed.

## Pull requests

PRs as a request surface: no.
