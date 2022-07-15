#!/usr/bin/env sh
node generate.js > hmcts.mdsl && docker run --rm -it -v $(pwd):/docs extenda/structurizr-to-png

