#!/usr/bin/env bash
# Publish the read-only Composer mirror of the PHP SDK (Packagist reads composer.json from a repo root):
#   sdk/php -> github.com/authfly/sdk-php
#   tools/split.sh    (run from a clean main after the commit you want to release)
# git subtree split is deterministic, so every run fast-forwards the mirror's main. Never force-push the mirror.
# Tag a release in the mirror afterwards, e.g.:  git push https://github.com/authfly/sdk-php.git split-sdk-php:refs/tags/v1.0.0   (sdk-php follows the JS contract version, @authfly/core)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -z "$(git status --porcelain)" ] || { echo "split: working tree not clean" >&2; exit 1; }
b=split-sdk-php
git branch -D "$b" >/dev/null 2>&1 || true
git subtree split --prefix=sdk/php -b "$b" >/dev/null
echo "split sdk-php: $(git rev-parse --short "$b") -> https://github.com/authfly/sdk-php.git main"
git push "https://github.com/authfly/sdk-php.git" "$b:main"
[ -n "${KEEP_SPLIT:-}" ] || git branch -D "$b" >/dev/null
