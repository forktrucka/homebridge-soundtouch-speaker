#!/usr/bin/env sh
# This script is used to publish the package to npm.

branch=$(git rev-parse --abbrev-ref HEAD)
npm set //registry.npmjs.org/:_authToken=$NPM_TOKEN
npm ci

if [ "$branch" = "latest" ]; then
  echo "Publishing to npm..."
  npm publish --access public
elif [ "$branch" = "beta" ]; then
  echo "Publishing beta to npm..."
  npm publish --tag beta
else
  echo "Not on latest or beta branch, skipping publish."
fi
