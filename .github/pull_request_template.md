## What

<!-- Two or three sentences. What this changes, not how. -->

## Why

<!-- The reason: link the issue, the plan phase, or the finding this closes.
     For a fix, state the root cause, not the symptom. -->

## How to review

<!-- Guide the reviewer. Where to start, which file is the real change,
     what can be skimmed (file moves, formatting, generated output). -->

## Testing

- [ ] Unit tests added or updated
- [ ] Integration tests added or updated
- [ ] Manually verified locally
- [ ] CI is green

<!-- Paste the relevant test output below. -->

## Risk

- [ ] Touches money (orders, payments, refunds, promotions, inventory)
- [ ] Touches authentication, roles, or permissions
- [ ] Changes the schema (migration included and reversible)
- [ ] Changes deployment configuration or environment variables
- [ ] None of the above

<!-- If anything is checked, explain it in one line each. -->

## Deployment notes

<!-- New environment variables, migrations, ordering constraints.
     Say "none" if there are none. -->

## Screenshots

<!-- Before and after, for anything visible. Delete this section otherwise. -->

## Checklist

- [ ] Diff is under ~400 lines, or the description explains why it cannot be split
- [ ] Self-reviewed the diff on GitHub before requesting review
- [ ] Commits follow the semantic format, none over 50 characters
- [ ] Everything in English: code, comments, commit messages, this description
- [ ] Author and committer are correct, no co-authorship trailers
- [ ] No emoji, no tooling mentions, no debug output, no secrets in the diff
- [ ] Docs updated: repository docs and the module note in the vault
