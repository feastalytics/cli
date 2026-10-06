#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/feastalytics-chatgpt.zip
(cd plugin && zip -r -X -q ../dist/feastalytics-chatgpt.zip plugin.json mcp.json icon.png skills -x '*.DS_Store')
echo "Wrote dist/feastalytics-chatgpt.zip"
