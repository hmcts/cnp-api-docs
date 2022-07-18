#!/usr/bin/env sh
node generate.js && docker run --rm -it -v $(pwd):/docs extenda/structurizr-to-png

