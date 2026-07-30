#!/usr/bin/env sh
set -eu

# REPO_SLUG defaults to GITHUB_REPOSITORY so this works under GitHub Actions as
# well as Travis. Without a slug the target path used to collapse to bare
# ".json", which is how docs/specs/.json kept reappearing.
REPO_SLUG="${TRAVIS_REPO_SLUG:-${GITHUB_REPOSITORY:-}}"
if [ -z "$REPO_SLUG" ]; then
    echo "ERROR: neither TRAVIS_REPO_SLUG nor GITHUB_REPOSITORY is set; cannot determine the spec filename." >&2
    exit 1
fi

REPO_NAME=$(echo "$REPO_SLUG" | cut -f2- -d/)
if [ -z "$REPO_NAME" ]; then
    echo "ERROR: could not derive a repo name from '$REPO_SLUG'." >&2
    exit 1
fi

NEW_DOCS=$(cat /tmp/swagger-specs.json)
if [ -z "$(printf '%s' "$NEW_DOCS" | tr -d '[:space:]')" ]; then
    echo "ERROR: /tmp/swagger-specs.json is empty; refusing to publish an empty spec." >&2
    exit 1
fi

CURRENT_DOCS=$(curl -fsS "https://hmcts.github.io/cnp-api-docs/specs/$REPO_NAME.json" || echo "")

if [ "$CURRENT_DOCS" != "$NEW_DOCS" ]; then
    echo "Update cnp-api-docs"
    mkdir swagger-staging
    cd swagger-staging
    git init

    git config user.name "HMCTS spec publisher"
    git config user.email "jenkins-reform-hmcts@users.noreply.github.com"
    git remote add upstream "https://${GH_TOKEN}@github.com/hmcts/cnp-api-docs.git"
    git pull upstream master

    TARGET_SPEC=docs/specs/"$REPO_NAME".json
    printf '%s\n' "$NEW_DOCS" > "$TARGET_SPEC"

    git add "$TARGET_SPEC"
    git commit -m "Update spec from $REPO_SLUG build ${TRAVIS_BUILD_NUMBER:-${GITHUB_RUN_ID:-unknown}}"
    git push --set-upstream upstream master
else
    echo "API Documentation is up to date."
fi

exit 0
