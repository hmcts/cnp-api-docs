#!/usr/bin/env sh
set -eu

REPO_SLUG="${TRAVIS_REPO_SLUG:-${GITHUB_REPOSITORY:-}}"
if [ -z "$REPO_SLUG" ]; then
    echo "ERROR: cannot determine the repository slug (tried TRAVIS_REPO_SLUG, GITHUB_REPOSITORY)." >&2
    echo "       Refusing to publish, as specs would be written to docs/specs/.<group>.json." >&2
    exit 1
fi

REPO_NAME=$(echo "$REPO_SLUG" | cut -f2- -d/)
COMMIT_REQUIRED=false

for group in "$@"
do
  NEW_DOCS=$(cat /tmp/swagger-specs."$group".json)

  # A blank or whitespace-only spec means the generating step produced nothing.
  # Publishing it creates the 1-byte specs that used to litter the registry.
  if [ -z "$(printf '%s' "$NEW_DOCS" | tr -d '[:space:]')" ]; then
      echo "ERROR: [Group: $group] generated spec is empty, skipping without publishing." >&2
      continue
  fi

  CURRENT_DOCS=$(curl -fsS "https://hmcts.github.io/cnp-api-docs/specs/$REPO_NAME.$group.json" || echo "")

  if [ "$CURRENT_DOCS" != "$NEW_DOCS" ]; then
      if [ "$COMMIT_REQUIRED" = false ] ; then
          echo "Update cnp-api-docs"
          mkdir swagger-staging
          cd swagger-staging
          git init

          git config user.name "HMCTS spec publisher"
          git config user.email "jenkins-reform-hmcts@users.noreply.github.com"
          git remote add upstream "https://${GH_TOKEN}@github.com/hmcts/cnp-api-docs.git"
          git pull upstream master
      fi

      TARGET_SPEC=docs/specs/"$REPO_NAME"."$group".json
      printf '%s\n' "$NEW_DOCS" > "$TARGET_SPEC"

      git add "$TARGET_SPEC"
      COMMIT_REQUIRED=true
  else
      echo "API Documentation for group $group is up to date."
  fi
done

if [ "$COMMIT_REQUIRED" = true ] ; then
    git commit -m "Update spec from $REPO_SLUG build ${TRAVIS_BUILD_NUMBER:-${GITHUB_RUN_ID:-unknown}}"
    git push --set-upstream upstream master
fi

exit 0
