#!/usr/bin/env bash
# Runs the api and backend db, grabs the generated swagger json spec and compares to what is in the
# central reform-api-docs repo. Updates reform-api-docs spec if needed

# assign environment variables
# shellcheck disable=SC1091
. ./.env

./gradlew clean installDist

docker-compose up -d

sleep 15

REPO_NAME=$(echo "$TRAVIS_REPO_SLUG" | cut -f2- -d/)
CURRENT_DOCS=$(curl https://hmcts.github.io/reform-api-docs/specs/"$REPO_NAME".json)
NEW_DOCS=$(curl http://localhost:"$SERVER_PORT"/v2/api-docs)

docker-compose stop

if [ "$NEW_DOCS" = "" ]; then
    echo "Could not retrieve new docs, aborting."
    docker-compose logs
elif [ "$CURRENT_DOCS" != "$NEW_DOCS" ]; then
    echo "Update reform-api-docs"

    git clone "https://${GH_TOKEN}@github.com/hmcts/reform-api-docs.git" swagger-staging
    cd swagger-staging || exit

    git config github.user "jenkins-reform-hmcts"
    git config user.name "Travis CI"
    git config user.email "travis@travis-ci.org"

    BRANCH_NAME="$REPO_NAME/spec-update"
    git checkout -b "$BRANCH_NAME"

    TARGET_SPEC=docs/specs/"$REPO_NAME".json
    echo "$NEW_DOCS" > "$TARGET_SPEC"

    git add "$TARGET_SPEC"
    git commit -m "Update spec for $REPO_NAME from $TRAVIS_PULL_REQUEST_SLUG"

    echo "Pushing spec update branch.."

    git push --set-upstream origin "$BRANCH_NAME"

    echo "Creating pull request.."

    ./local/bin/hub pull-request -m "Update spec for $REPO_NAME"
else
    echo "API Documentation is up to date."
fi

exit 0
