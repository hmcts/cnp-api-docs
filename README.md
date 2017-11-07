# HMCTS Reform API Documentation

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

In case the `spec` field is present, API bubble represented in the graph will allow to click through to the API documentation.

## Tools

There are very simple npm scripts to update the `swagger-ui` and `vis.js` currently used to show docs

```bash
npm run update-swagger
npm run update-vis
```

Repository is using swagger bundle so instead of downloading individual `swagger-ui` packages it gets the `swagger-ui-dist` for the whole thing and then just graps everything from `dist` upon npm script execution.
