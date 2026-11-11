#!/bin/sh
cd "$(dirname "$0")/.." || exit 1
PATH="$HOME/.local/node/bin:$PATH" node test/app.test.js
