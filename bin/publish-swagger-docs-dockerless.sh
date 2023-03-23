#!/usr/bin/env sh

REPO_NAME=$(echo "$TRAVIS_REPO_SLUG" | cut -f2- -d/)
CURRENT_DOCS=$(curl https://hmcts.github.io/cnp-api-docs/specs/"$REPO_NAME".json)
NEW_DOCS=$(cat /tmp/swagger-specs.json)

if [ "$CURRENT_DOCS" != "$NEW_DOCS" ]; then
    echo "Update cnp-api-docs"
    mkdir swagger-staging
    cd swagger-staging
    git init

    git config user.name "Travis CI"
    git config user.email "travis@travis-ci.org"
    git remote add upstream "https://${GH_TOKEN}@github.com/hmcts/cnp-api-docs.git"
    git pull upstream master

    TARGET_SPEC=docs/specs/"$REPO_NAME".json
    echo "$NEW_DOCS" > "$TARGET_SPEC"

    git add "$TARGET_SPEC"
    git commit -m "Update spec from $TRAVIS_REPO_SLUG build $TRAVIS_BUILD_NUMBER"
    git push --set-upstream upstream master
else
    echo "API Documentation is up to date."
fi

exit 0
