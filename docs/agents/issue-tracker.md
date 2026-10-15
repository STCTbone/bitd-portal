# Issue tracker: GitHub

Issues and specs live in this fork's GitHub Issues. Use the `gh` CLI.

## Repository selection

Resolve the fork's owner/name from the checkout's `origin` remote. Use `--repo <owner>/<repo>` explicitly for issue and label commands. The upstream `bsxp/bitd-portal` repository is a reference; ticket and label writes target the fork.

## Conventions

- Create: `gh issue create --repo <owner>/<repo> --title "..." --body-file <file>`.
- Read: `gh issue view <number> --repo <owner>/<repo> --json number,title,body,labels,comments`.
- List: `gh issue list --repo <owner>/<repo> --state open --json number,title,body,labels`, adding label or state filters as needed.
- Comment: `gh issue comment <number> --repo <owner>/<repo> --body-file <file>`.
- Apply or remove labels: `gh issue edit <number> --repo <owner>/<repo> --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number> --repo <owner>/<repo>`.
- For multiline bodies and comments, write the exact text to a temporary file and pass `--body-file`.
- Group implementation tickets as native sub-issues where supported. Otherwise, put `Part of #<parent>` at the top of each child and link the children from a task list in the parent.
- Represent blockers with native issue dependencies where supported. Otherwise, record `Blocked by: #<number>` at the top of the child body. Work is unblocked when all its blockers are closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. Resolve the item type before acting on a bare issue number.

## Skill operations

When a skill says “publish to the issue tracker,” create a GitHub issue in the fork. When it says “fetch the relevant ticket,” read the referenced issue with its labels and comments.
