#!/usr/bin/env sh
# This script is used to publish the package to npm.
echo running publish.sh

branch=$(git rev-parse --abbrev-ref HEAD)

if [ "$branch" = "latest" ]; then
  echo "Publishing to npm..."
  npm publish --tag beta #fix up when ready
elif [ "$branch" = "beta" ]; then
  echo "Publishing beta to npm..."
  npm publish --tag beta
else
  echo "Not on latest or beta branch, skipping publish."
fi
