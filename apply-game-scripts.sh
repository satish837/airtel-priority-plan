#!/bin/sh
# Copy edited logic bundle into the live asset path the game loads.
set -e
cd "$(dirname "$0")"
cp -f game-data/source/__game-scripts.js game-data/__game-scripts.js
echo "Applied → game-data/__game-scripts.js (refresh browser)"
