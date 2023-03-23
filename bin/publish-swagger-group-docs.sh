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

REPO_NAME=$(echo "$TRAVIS_REPO_SLUG" | cut -f2- -d/)
buildDir=$(pwd)

for group in "$@"
do
    cd $buildDir

    CURRENT_DOCS=$(curl "https://hmcts.github.io/cnp-api-docs/specs/$REPO_NAME.$group.json")
    NEW_DOCS=$(curl "http://localhost:$SERVER_PORT/v2/api-docs?group=$group")

    if [ "$NEW_DOCS" = "" ]; then
        echo "[Group: $group] Could not retrieve new docs, aborting."
        docker-compose logs
    elif [ "$CURRENT_DOCS" != "$NEW_DOCS" ]; then
        echo "[Group: $group] Update cnp-api-docs"
        mkdir "swagger-staging-$group"
        cd "swagger-staging-$group"
        git init

        git config user.name "Travis CI"
        git config user.email "travis@travis-ci.org"
        git remote add upstream "https://${GH_TOKEN}@github.com/hmcts/cnp-api-docs.git"
        git pull upstream master

        TARGET_SPEC="docs/specs/$REPO_NAME.$group.json"
        echo "$NEW_DOCS" > "$TARGET_SPEC"

        git add "$TARGET_SPEC"
        git commit -m "[Group: $group] Update spec from $TRAVIS_REPO_SLUG build $TRAVIS_BUILD_NUMBER"
        git push --set-upstream upstream master
    else
        echo "[Group: $group] API Documentation is up to date."
    fi
done

cd $buildDir
docker-compose stop

exit 0
