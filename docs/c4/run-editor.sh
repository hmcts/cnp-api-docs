#!/usr/bin/env sh

if [ "$1" = "" ] || [ ! -d "$1" ]
then
  echo "Directory is required"
  exit 1
fi

docker pull -q structurizr/lite
docker run --user "$UID" -it --rm -p 8080:8080 -v $PWD:/usr/local/structurizr -e STRUCTURIZR_WORKSPACE_PATH=$1 structurizr/lite
