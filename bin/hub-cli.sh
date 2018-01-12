#!/usr/bin/env bash
# Checks whether GitHub's CLI `hub` exists and installs one as needed

mkdir ~/hub-latest

wget -O ~/hub-latest.tar.gz "$(curl https://api.github.com/repos/github/hub/releases/latest | jq -r '.assets | map(select(.label | test("for Linux 64-bit")))[0].browser_download_url')"

tar xf ~/hub-latest.tar.gz -C ~/hub-latest --strip-components 1

~/hub-latest/install

hub version
