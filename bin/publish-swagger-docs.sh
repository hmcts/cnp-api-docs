#!/usr/bin/env bash
# Runs the api and backend db, grabs the generated swagger json spec and compares to what is in the
# central cnp-api-docs repo. Updates cnp-api-docs spec if needed
#
# Invoked by `curl | sh` from six live Jenkinsfile_CNP files, so it must keep
# working under Jenkins as well as Travis. REPO_SLUG falls back through the
# Travis, GitHub Actions and Jenkins variables; without one the target path used
# to collapse to bare ".json", which is how docs/specs/.json kept reappearing.
#
# Deliberately no `set -eu`: this runs gradle, docker-compose and wget in live
# Jenkins pipelines that currently tolerate their failures, and `set -u` would
# abort on TRAVIS_BUILD_NUMBER being unset under Jenkins. Guards are explicit
# instead.

# assign environment variables
# shellcheck disable=SC1091
. ./.env

REPO_SLUG="${TRAVIS_REPO_SLUG:-${GITHUB_REPOSITORY:-}}"
if [ -z "$REPO_SLUG" ] && [ -n "${GIT_URL:-}" ]; then
    # Jenkins exposes the clone URL rather than a slug.
    REPO_SLUG=$(echo "$GIT_URL" | sed -E 's#.*[:/]([^/]+/[^/]+?)(\.git)?$#\1#')
fi
if [ -z "$REPO_SLUG" ]; then
    echo "ERROR: cannot determine the repository slug (tried TRAVIS_REPO_SLUG, GITHUB_REPOSITORY, GIT_URL)." >&2
    echo "       Refusing to publish, as the spec would be written to docs/specs/.json." >&2
    exit 1
fi

./gradlew clean
./gradlew assemble
./gradlew installDist

docker-compose up -d

sleep 15
wget --retry-connrefused --tries=120 --waitretry=1 -O /dev/null http://localhost:$SERVER_PORT/health
#curl --retry-connrefused --retry 120 --retry-delay 1 http://localhost:{$SERVER_PORT}/health

REPO_NAME=$(echo "$REPO_SLUG" | cut -f2- -d/)
CURRENT_DOCS=$(curl -fsS "https://hmcts.github.io/cnp-api-docs/specs/$REPO_NAME.json" || echo "")
NEW_DOCS=$(curl http://localhost:"$SERVER_PORT"/v2/api-docs)

docker-compose stop

# A blank or whitespace-only response means the app never came up. Publishing it
# would overwrite a good spec with an empty file.
if [ -z "$(printf '%s' "$NEW_DOCS" | tr -d '[:space:]')" ]; then
    echo "ERROR: could not retrieve new docs from the application, aborting without publishing." >&2
    docker-compose logs
    exit 1
elif [ "$CURRENT_DOCS" != "$NEW_DOCS" ]; then
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
    git commit -m "Update spec from $REPO_SLUG build ${TRAVIS_BUILD_NUMBER:-${BUILD_NUMBER:-unknown}}"
    git push --set-upstream upstream master
else
    echo "API Documentation is up to date."
fi

exit 0
