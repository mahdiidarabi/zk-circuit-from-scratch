#!/bin/bash
set -e

# Resolve the project root (one directory above this script's location)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"
cd "$PROJECT_ROOT"

echo "🔨 Compiling circuits..."
npx hardhat zkit compile

echo "📋 Copying ceremony artifacts into zkit/..."
cp ceremony/circuit_final.zkey \
   zkit/artifacts/circuits/Multiplier.circom/Multiplier.groth16.zkey
cp ceremony/verification_key.json \
   zkit/artifacts/circuits/Multiplier.circom/Multiplier.groth16.vkey.json

echo "📜 Regenerating Solidity verifier..."
npx hardhat zkit verifiers

echo "🧱 Compiling contracts..."
npx hardhat compile

echo "✅ Rebuild complete. Run 'npx hardhat test' to verify."