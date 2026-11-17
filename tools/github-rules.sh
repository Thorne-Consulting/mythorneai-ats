#!/usr/bin/env sh
# Applies the repository's merge settings and branch rules from .github/rulesets. Needs an
# admin's `gh` sign-in. Safe to run again: it replaces a ruleset with the same name.
#
#   tools/github-rules.sh Thorne-Consulting/mythorneai-ats
set -eu
REPO="${1:?repository, for example Thorne-Consulting/mythorneai-ats}"
ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)

echo "Merge settings: squash only, auto-merge on, delete the branch after merge."
gh api --method PATCH "repos/$REPO" \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F allow_auto_merge=true -F delete_branch_on_merge=true \
  -F squash_merge_commit_title=PR_TITLE -F squash_merge_commit_message=PR_BODY >/dev/null

echo "The staging branch, from main, if it is not there yet."
if ! gh api "repos/$REPO/branches/staging" >/dev/null 2>&1; then
  sha=$(gh api "repos/$REPO/git/ref/heads/main" --jq .object.sha)
  gh api --method POST "repos/$REPO/git/refs" -f ref=refs/heads/staging -f sha="$sha" >/dev/null
fi

for file in "$ROOT"/.github/rulesets/*.json; do
  name=$(basename "$file" .json)
  id=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id" | head -1)
  if [ -n "$id" ]; then
    echo "Ruleset $name: updating."
    gh api --method PUT "repos/$REPO/rulesets/$id" --input "$file" >/dev/null
  else
    echo "Ruleset $name: creating."
    gh api --method POST "repos/$REPO/rulesets" --input "$file" >/dev/null
  fi
done

echo "Workflows from forks: a person approves every run first (the runners are self-hosted)."
gh api --method PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" \
  -f approval_policy=all_external_contributors >/dev/null || echo "  (could not set; set it under Settings > Actions > General)"

echo "Environments: both deploy only from protected branches; production waits for a reviewer."
gh api --method PUT "repos/$REPO/environments/staging" \
  --input - <<EOF >/dev/null
{ "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false } }
EOF
# prevent_self_review stays off: with one person on the team it would block every deploy.
# Turn it on once a second reviewer exists.
gh api --method PUT "repos/$REPO/environments/production" \
  --input - <<EOF >/dev/null
{ "reviewers": [{ "type": "User", "id": $(gh api user --jq .id) }], "prevent_self_review": false, "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false } }
EOF

echo "Done. Other rulesets on this repository:"
gh api "repos/$REPO/rulesets" --jq '.[] | "  \(.name) (\(.enforcement))"'
