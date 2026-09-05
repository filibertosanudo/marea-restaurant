#!/bin/sh
# Validates a commit message against docs/CONVENCIONES.md section 3.
# Shared by .githooks/commit-msg (local) and the "commits" job in
# .github/workflows/ci.yml — a clone without the hook enabled must not be
# able to slip a malformed commit past review.
#
# Usage: validate-commit-msg.sh <path-to-message-file>

MSG_FILE="$1"
SUBJECT=$(head -n 1 "$MSG_FILE")

# Commits git generates on its own (merge, revert, fixup, squash) pass untouched.
case "$SUBJECT" in
  Merge\ *|Revert\ *|fixup!\ *|squash!\ *) exit 0 ;;
esac

fail() {
  echo "commit-msg: $1" >&2
  echo "" >&2
  echo "  subject: $SUBJECT" >&2
  echo "  format:  <type>(<scope>): <description>   max 50 characters" >&2
  echo "  types:   feat fix refactor perf docs test build ci style chore" >&2
  echo "  see docs/CONVENCIONES.md" >&2
  exit 1
}

TYPES='feat|fix|refactor|perf|docs|test|build|ci|style|chore'

echo "$SUBJECT" | grep -Eq "^($TYPES)(\([a-z0-9-]+\))?: .+" \
  || fail "missing the semantic prefix or the format doesn't match"

echo "$SUBJECT" | grep -Eq "^($TYPES)(\([a-z0-9-]+\))?: [a-z]" \
  || fail "the description starts with a capital letter"

[ "${#SUBJECT}" -le 50 ] \
  || fail "the subject is ${#SUBJECT} characters, the max is 50"

case "$SUBJECT" in
  *.|*...) fail "the subject ends with a period" ;;
esac

# Present-imperative verb: reject the most common past-tense and
# third-person endings on the description's first word.
VERB=$(echo "$SUBJECT" | sed -E "s/^($TYPES)(\([a-z0-9-]+\))?: ([a-z]+).*/\3/")
case "$VERB" in
  *ed|adds|fixes|removes|updates|changes|creates|deletes)
    fail "use present imperative: add, fix, remove — not '$VERB'" ;;
esac

# No tool mentions or co-authorship, anywhere in the message.
grep -Eiq "claude|copilot|chatgpt|co-authored|generated with|written with|assisted by" "$MSG_FILE" \
  && fail "the message mentions a tool or attributes co-authorship"

# No emoji. Skipped silently if this grep doesn't support -P.
if echo "" | grep -qP "" 2>/dev/null; then
  grep -qP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}\x{2190}-\x{21FF}]" "$MSG_FILE" \
    && fail "the message contains emoji"
fi

exit 0
