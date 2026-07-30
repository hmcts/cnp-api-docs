#!/usr/bin/env bash
#
# For each group passed as an argument, runs the api and backend db, grabs the
# generated swagger json spec and compares to what is in the central
# cnp-api-docs repo. Updates cnp-api-docs spec if needed
#
# Usage: ./publish-swagger-group-docs.sh <groups...>
#   Params:
#       - groups: Names of Swagger groups

# assign environment variables
# shellcheck disable=SC1091
. ./.env

./gradlew clean
./gradlew assemble
./gradlew installDist

docker-compose up -d

sleep 15
wget --retry-connrefused --tries=120 --waitretry=1 -O /dev/null http://localhost:$SERVER_PORT/health
#curl --retry-connrefused --retry 120 --retry-delay 1 http://localhost:{$SERVER_PORT}/health

REPO_SLUG="${TRAVIS_REPO_SLUG:-${GITHUB_REPOSITORY:-}}"
if [ -z "$REPO_SLUG" ]; then
    echo "ERROR: cannot determine the repository slug (tried TRAVIS_REPO_SLUG, GITHUB_REPOSITORY)." >&2
    echo "       Refusing to publish, as specs would be written to docs/specs/.<group>.json." >&2
    exit 1
fi

REPO_NAME=$(echo "$REPO_SLUG" | cut -f2- -d/)
buildDir=$(pwd)
failed=0

for group in "$@"
do
    cd $buildDir

    CURRENT_DOCS=$(curl -fsS "https://hmcts.github.io/cnp-api-docs/specs/$REPO_NAME.$group.json" || echo "")
    NEW_DOCS=$(curl "http://localhost:$SERVER_PORT/v2/api-docs?group=$group")

    # A blank or whitespace-only response means this group produced nothing.
    # Publishing it creates the 1-byte specs that used to litter the registry.
    if [ -z "$(printf '%s' "$NEW_DOCS" | tr -d '[:space:]')" ]; then
        echo "ERROR: [Group: $group] could not retrieve new docs, skipping this group without publishing." >&2
        docker-compose logs
        failed=1
    elif [ "$CURRENT_DOCS" != "$NEW_DOCS" ]; then
        echo "[Group: $group] Update cnp-api-docs"
        mkdir "swagger-staging-$group"
        cd "swagger-staging-$group"
        git init

        git config user.name "HMCTS spec publisher"
        git config user.email "jenkins-reform-hmcts@users.noreply.github.com"
        git remote add upstream "https://${GH_TOKEN}@github.com/hmcts/cnp-api-docs.git"
        git pull upstream master

        TARGET_SPEC="docs/specs/$REPO_NAME.$group.json"
        printf '%s\n' "$NEW_DOCS" > "$TARGET_SPEC"

        git add "$TARGET_SPEC"
        git commit -m "[Group: $group] Update spec from $REPO_SLUG build ${TRAVIS_BUILD_NUMBER:-${BUILD_NUMBER:-unknown}}"
        git push --set-upstream upstream master
    else
        echo "[Group: $group] API Documentation is up to date."
    fi
done

cd $buildDir
docker-compose stop

exit $failed
