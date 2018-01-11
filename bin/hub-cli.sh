#!/usr/bin/env bash
# Checks whether GitHub's CLI `hub` exists and installs one as needed

if ! type "hub" > /dev/null; then
    unameOut="$(uname -s)"

    echo "Checking OS support for $unameOut"

    case "${unameOut}" in
        Linux*)     machine="Linux 64-bit";;
        Darwin*)    machine="OS X";;
        *)          machine="UNKNOWN:$unameOut"
    esac

    echo "Selected machine: $machine"

    mkdir ~/hub-latest
    wget -O ~/hub-latest.tar.gz "$(curl https://api.github.com/repos/github/hub/releases/latest | jq -r '.assets | map(select(.label | test("$machine")))[0].browser_download_url')"
    tar xf ~/hub-latest.tar.gz -C ~/hub-latest --strip-components 1
    ~/hub-latest/install

    echo "Successfully installed hub:"
else
    echo "Hub is already installed!"
fi

hub version
