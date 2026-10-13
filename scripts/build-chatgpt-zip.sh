#!/bin/sh
# Builds two ChatGPT plugin archives into dist/:
#   feastalytics-chatgpt.zip  the full plugin (mcp.json + skill). ChatGPT runs a
#                             plugin that carries mcp.json as a local plugin, so
#                             this one installs in the desktop app only.
#   feastalytics-skill.zip    the feast skill alone, no mcp.json. Installs on
#                             ChatGPT web and mobile next to a custom MCP server
#                             plugin pointed at https://mcp.feast-api.com/mcp.
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/feastalytics-chatgpt.zip dist/feastalytics-skill.zip
(cd plugin && zip -r -X -q ../dist/feastalytics-chatgpt.zip plugin.json mcp.json icon.png skills -x '*.DS_Store')
echo "Wrote dist/feastalytics-chatgpt.zip"

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
cp -R plugin/skills plugin/icon.png "$stage/"
node -e '
const fs = require("fs");
const m = JSON.parse(fs.readFileSync("plugin/plugin.json", "utf8"));
m.name = "feastalytics-skill";
m.description = "The feast skill: how to operate a Feastalytics organization through the Feast MCP server plugin in ChatGPT.";
const ui = m.extensions["com.openai"].interface;
ui.displayName = "Feastalytics skill";
ui.shortDescription = "Teaches ChatGPT how to use the Feast plugin";
ui.longDescription = "Install this next to the Feast custom MCP server plugin. It teaches ChatGPT the Feastalytics workflows: campaigns, automations, funnels, the members program, the wallet pass, creator sourcing, Meta ads, texting, onboarding and data queries.";
fs.writeFileSync(process.argv[1] + "/plugin.json", JSON.stringify(m, null, 2) + "\n");
' "$stage"
(cd "$stage" && zip -r -X -q "$OLDPWD/dist/feastalytics-skill.zip" plugin.json icon.png skills -x '*.DS_Store')
echo "Wrote dist/feastalytics-skill.zip"
