# Cloud Native Platform API Documentation

## Intro

Documentation is presented in two ways:

- [Network graph](#network)
- [Swagger UI](#swagger-ui)

### Network

In order to populate one of the API in the network graph we need to enter the following snippet inside the [microservices.json](docs/microservices.json):

```json
{
    "id": "ccd-user-profile",
    "name": "User Profile",
    "group": "CCD",
    "description": null,
    "repository": null,
    "spec": null,
    "urls": [],
    "dependencies": [
        {
            "id": "idam",
            "hard": true,
            "apis": []
        },
        {
            "id": "idam-s2s",
            "hard": true,
            "apis": []
        }
    ],
    "apis": [],
    "version": null
}
```

In case you are introducing a new network group, please provide relevant information about it in the `groups` field (follow specification linked below and implementation linked above).

Full specification can be viewed in [json schema](microservices-schema.json).

### Swagger UI

In case the `spec` field is present, API bubble represented in the graph will allow to click through to the API documentation. If `urls` array is present spec will not be used, but urls defined with `name` and `url` will be used instead.

[How to publish swagger docs](#publish-swagger-docs) for your spring boot template application

## Getting started

This repo uses Yarn 4 (Berry) with `node-modules` as the linker, and is a single
Yarn workspace with the site in `site/`. The Yarn binary is committed to
`.yarn/releases/`, so installs do not depend on a Corepack download.

```bash
corepack enable   # once per machine
yarn install
```

## Running the portal locally

Two ways, depending on what you are doing.

**Live reload, for working on the site:**

```bash
cd site && yarn dev
```

Astro prints a URL; the pages are served under `/cnp-api-docs/`. Specs are not
copied in this mode, so the API reference pages will not render — use the
production build for those.

**Production build, exactly what gets deployed:**

```bash
yarn build-site    # model, then the Astro site
yarn assemble      # copies docs/specs verbatim, verifying every byte
yarn serve-site    # http://localhost:8080/cnp-api-docs/
```

`yarn assemble` refuses to produce a deployable tree if any spec's bytes change
during the copy — those URLs are fetched at runtime by other services.
`yarn serve-site` serves under `/cnp-api-docs/` to match GitHub Pages; visiting
`/` redirects there. Set `PORT` to use a different port.

## Testing

```bash
yarn test              # unit tests plus the consumer contract
yarn validate-specs    # classify every spec in docs/specs/
```

The hosted checks in the consumer contract are skipped by default. To verify the
live URLs that other services depend on:

```bash
CHECK_HOSTED=1 node --test test/consumer-contract.test.mjs
```

## Registry health

Every spec in `docs/specs/` is validated on each push to master.

Publishers push straight to master and the publishing bot bypasses branch
protection, so validation cannot block a bad spec landing. Instead, if a spec
that previously parsed is replaced by one that does not,
`.github/workflows/validate-specs.yml` restores the previous version and files an
issue. A spec that was already broken, or that arrives broken on its first
publish, is reported but never rewritten.

`test/consumer-contract.test.mjs` pins the spec filenames that are fetched from
outside this repo — by XUI at runtime, by the CCD and HMC F-125 acceptance tests,
and by terraform when registering APIs into Azure API Management. Do not rename
or delete those files.

## Publish Swagger docs

Use the reusable workflow. It runs a test in your repo that writes the spec to a
temporary file, then publishes it here:

```yaml
# .github/workflows/publish-openapi.yml
name: Publish OpenAPI spec
on:
  push:
    branches: [master]

jobs:
  publish-openapi:
    uses: hmcts/workflow-publish-openapi-spec/.github/workflows/publish-openapi.yml@v1
    secrets:
      SWAGGER_PUBLISHER_API_TOKEN: ${{ secrets.SWAGGER_PUBLISHER_API_TOKEN }}
    with:
      test_to_run: 'uk.gov.hmcts.reform.<your>.openapi.OpenAPIPublisherTest'
      java_version: 21
```

The spec is published to `docs/specs/<repo-name>.json` and served at
`https://hmcts.github.io/cnp-api-docs/specs/<repo-name>.json`.

### Legacy shell scripts

The scripts in `bin/` predate the reusable workflow and are still `curl`-piped by
a handful of `Jenkinsfile_CNP` builds, so they remain supported. Do not use them
for new services. They require `GH_TOKEN`, and a repository slug from
`TRAVIS_REPO_SLUG`, `GITHUB_REPOSITORY` or (for the docker variant) `GIT_URL` —
without one they exit non-zero rather than writing the spec to a bare
`docs/specs/.json`. They also refuse to publish an empty spec, which is what used
to silently overwrite good specs with 1-byte files.

### Custom Swagger groups

A project can split its Swagger documentation into independent groups (for
example `v1_internal` and `v2_external`). The reusable workflow publishes the
default group only, so services with custom groups run a group-aware script and
pass each group as an argument:

```yaml
- run: |
    curl https://raw.githubusercontent.com/hmcts/cnp-api-docs/master/bin/publish-swagger-docs-group-dockerless.sh > publish-swagger-docs.sh
    sh ./publish-swagger-docs.sh v1_internal v1_external v2_internal v2_external
  env:
    GH_TOKEN: ${{ secrets.SWAGGER_PUBLISHER_API_TOKEN }}
```

Each group is published as `docs/specs/<repo>.<group>.json`. A group whose spec
comes back empty is skipped rather than published, so one failing group no longer
overwrites a good spec with a 1-byte file.

Use `publish-swagger-group-docs.sh` instead if the spec has to be scraped from
the running application; it expects `docker-compose.yml` and `.env` files as per
the [Spring Boot Template](https://github.com/hmcts/spring-boot-template).
