#!/bin/bash
set -e
npx hardhat zkit:compile   # compile r1cs/wasm only — no setup
cp ceremony/circuit_final.zkey \
   zkit/artifacts/circuits/Multiplier.circom/Multiplier.groth16.zkey
cp ceremony/verification_key.json \
   zkit/artifacts/circuits/Multiplier.circom/Multiplier.groth16.vkey.json
npx hardhat zkit:verifiers
npx hardhat compile