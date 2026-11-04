#!/bin/sh
# Builds dist/feast-skill.zip for claude.ai (Customize > Skills > Upload a skill).
# claude.ai wants the skill folder itself at the zip root, so this zips
# plugin/skills/feast as feast/.
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/feast-skill.zip
(cd plugin/skills && zip -r -X -q ../../dist/feast-skill.zip feast -x '*.DS_Store' -x '*__pycache__*' -x '*.pyc')
echo "Wrote dist/feast-skill.zip"
