#!/bin/bash
eval "$(fnm env)" && fnm use
npx tsx scripts/simulatePrompts.ts --email "$1" --days "${2:-14}"
