
# Building Zero-Knowledge Circuits with Hardhat and Circom

A guide to setting up a Hardhat project with `@solarity/hardhat-zkit`, building a Circom circuit, running a multi-party trusted setup ceremony, and generating a Solidity verifier.

## Prerequisites

- **Node.js** 18+ and npm
- **Circom 2.x** (`cargo install --git https://github.com/iden3/circom.git`)

## Step 1: Initialize Hardhat

⚠️ **Use Hardhat 2, not Hardhat 3.** The ZK plugin ecosystem (including `@solarity/hardhat-zkit`) is built against Hardhat 2's plugin API.

```bash
npm init -y
npm install --save-dev hardhat@^2.22.0
npx hardhat init
```

Choose **"Create a TypeScript project"** and accept the defaults. Verify with `npx hardhat --version` (should print `2.x.x`).

## Step 2: Install ZKit

```bash
npm install --save-dev @solarity/hardhat-zkit
npm install circomlib
```

## Step 3: Register the plugin

In `hardhat.config.ts`, add the import alongside the toolbox:

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@solarity/hardhat-zkit";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  zkit: {
    circuitsDir: "circuits",
    compilationSettings: {
      artifactsDir: "zkit/artifacts",
      onlyFiles: [],
      skipFiles: [],
    },
    setupSettings: {
      contributionSettings: {
        provingSystem: "groth16",
        contributions: 2,
      },
    },
    verifiersSettings: {
      verifiersDir: "contracts/verifiers",
      verifiersType: "sol",
    },
    quiet: false,
  },
};

export default config;
```

Then add a `zkit` config block (see `hardhat.config.ts` for full settings). Confirm tasks are registered with `npx hardhat` — you should see `zkit make`, `zkit verifiers`, etc.

## Step 4: Write the circuit

Put `.circom` files in `circuits/`. See `circuits/Multiplier.circom` for the example — a proof of knowledge of two factors of a public product.

### Circom assignment operators (the #1 source of beginner errors)

| Operator | Effect | When to use |
|---|---|---|
| `<==` | Assign **and** constrain | Default — for quadratic expressions |
| `<--` | Assign only, no constraint | Non-quadratic ops (division, comparisons) |
| `===` | Constrain only, no assignment | Pairs with `<--` |

⚠️ `<--` is unsafe alone — always pair it with a `===` constraint. Using `===` on an unassigned signal produces `T3001: signal not initialized`.

## Step 5: Compile the circuit

```bash
npx hardhat zkit compile
```

This generates `.r1cs`, `.wasm`, and `.sym` files under `zkit/artifacts/circuits/`. **Don't run `zkit make` yet** — that would trigger ZKit's local-only trusted setup. We're going to run a proper multi-party ceremony instead.

## Step 6: Trusted setup ceremony

Groth16 requires a per-circuit trusted setup. The security model: **as long as at least one participant honestly destroys their randomness ("toxic waste"), the setup is secure.** A real ceremony involves multiple independent parties.

### Get the Phase 1 ptau file

Phase 1 is universal across circuits. We use the public Hermez ceremony output. For a circuit with up to 256 constraints, `_08.ptau` is sufficient (sizing table below).

```bash
mkdir -p ceremony && cd ceremony

curl -L -o powersOfTau28_hez_final_08.ptau \
  https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_08.ptau

# Link the r1cs so everything's in one folder
ln -sf ../zkit/artifacts/circuits/Multiplier.circom/Multiplier.r1cs .
```

**ptau sizing guide:**

| File | Max constraints |
|---|---|
| `_08.ptau` | 256 |
| `_10.ptau` | 1,024 |
| `_12.ptau` | 4,096 |
| `_14.ptau` | 16,384 |
| `_16.ptau` | 65,536 |

### Run a 3-party Phase 2 ceremony

```bash
# Coordinator: initial zkey (no secrets, publishable)
npx snarkjs groth16 setup Multiplier.r1cs powersOfTau28_hez_final_08.ptau circuit_0000.zkey

# Each participant adds their randomness — they'll be prompted to type entropy
npx snarkjs zkey contribute circuit_0000.zkey circuit_0001.zkey --name="Alice" -v
npx snarkjs zkey contribute circuit_0001.zkey circuit_0002.zkey --name="Bob"   -v
npx snarkjs zkey contribute circuit_0002.zkey circuit_0003.zkey --name="Carol" -v

# Final public beacon — prevents the last contributor from biasing the result.
# Use a Bitcoin block hash announced ahead of time for production.
npx snarkjs zkey beacon circuit_0003.zkey circuit_final.zkey \
  0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f \
  10 -n="Final Beacon"

# Verify the full transcript — anyone can run this
npx snarkjs zkey verify Multiplier.r1cs powersOfTau28_hez_final_08.ptau circuit_final.zkey

# Export the verification key
npx snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
```

You should see `ZKey OK!` after `zkey verify`. This walks the chain of contributions and confirms each was performed correctly.

### Wire the ceremony output into the project

```bash
cd ..

cp ceremony/circuit_final.zkey \
   zkit/artifacts/circuits/Multiplier.circom/Multiplier.groth16.zkey
cp ceremony/verification_key.json \
   zkit/artifacts/circuits/Multiplier.circom/Multiplier.groth16.vkey.json
```

## Step 7: Generate the Solidity verifier

```bash
npx hardhat zkit verifiers
```

The verifier in `contracts/verifiers/` now matches the ceremony's verification key.

## Step 8: Test

```bash
npx hardhat compile
npx hardhat test
```

See `test/Multiplier.test.ts`. The suite covers:

- **Positive cases** — valid proofs verify on-chain
- **Tampered public signals** — proof is real but the claimed output is a lie
- **Tampered proof points** — modifying the proof itself
- **Proof reuse with mismatched signals** — confirms the proof is bound to its public inputs
- **Circuit-level rejection** — inputs that violate constraints fail at proof generation

## Project structure

```
├── circuits/                              # .circom sources
├── contracts/
│   └── verifiers/                         # auto-generated from ceremony output
├── ceremony/                              # trusted setup transcript
│   ├── powersOfTau28_hez_final_08.ptau
│   ├── circuit_0000.zkey                  # initial (no secrets)
│   ├── circuit_0001.zkey                  # after Alice
│   ├── circuit_0002.zkey                  # after Bob
│   ├── circuit_0003.zkey                  # after Carol
│   ├── circuit_final.zkey                 # after beacon
│   └── verification_key.json
├── test/
├── zkit/artifacts/                        # r1cs, wasm, ceremony zkey/vkey
├── generated-types/zkit/                  # auto-generated TS bindings
└── hardhat.config.ts
```

Add `generated-types/` and large auto-generated build artifacts to `.gitignore`, but **commit the ceremony folder in full** — auditors need it to re-verify the transcript.

## ⚠️ Don't run `zkit make` after the ceremony

`zkit make` regenerates the zkey locally, overwriting your ceremony output. Once you've run a real ceremony, use this rebuild script instead:

```bash
# scripts/rebuild.sh
#!/bin/bash
set -e
npx hardhat zkit compile

cp ceremony/circuit_final.zkey \
   zkit/artifacts/circuits/Multiplier.circom/Multiplier.groth16.zkey

cp ceremony/verification_key.json \
   zkit/artifacts/circuits/Multiplier.circom/Multiplier.groth16.vkey.json

npx hardhat zkit verifiers

npx hardhat compile
```

If you change the circuit itself (new constraints), you must run a fresh ceremony — the old zkey is no longer valid.

## Troubleshooting

| Error | Cause / Fix |
|---|---|
| `HHE3: No Hardhat config file found` | Hardhat 3 installed. Downgrade to `hardhat@^2.22.0`. |
| `ERESOLVE could not resolve dependency tree` | Hardhat 2 vs 3 mismatch. Confirm `npx hardhat --version`. |
| `Cannot find module '@nomicfoundation/hardhat-toolbox'` | Run `npm install --save-dev @nomicfoundation/hardhat-toolbox`. |
| `HH303: Unrecognized task 'zkit make'` | Plugin not imported. Add `import "@solarity/hardhat-zkit";` to config. |
| `HH305: Unrecognized param --show-stack-trace` | Plural: `--show-stack-traces`. |
| `T3001: signal not initialized` (circom) | A signal has `===` but no `<==` / `<--` assignment. |
| `DeclarationError: Identifier not found` (consumer contract) | Verifier's `verifyProof` signature differs from what your contract assumes. Check the generated file. |
| `ReferenceError: circuit is not defined` (tests) | An `it(...)` block is outside the `describe` that owns the `before` hook. |
| `Powers of tau is not enough` (ceremony) | Circuit has more constraints than the ptau supports. Use a larger one. |
| Tests fail after ceremony | Forgot to run `zkit verifiers` after copying the new zkey. The on-chain verifier hardcodes the key — they must match. |

## Notes for real circuits

- **Plonk skips Phase 2 entirely.** Set `provingSystem: "plonk"` in `hardhat.config.ts` to avoid running a per-circuit ceremony — universal Phase 1 ptau is enough. Most newer projects choose this despite slightly slower proving.
- For coordinating real multi-party ceremonies, use **[p0tion](https://github.com/privacy-scaling-explorations/p0tion)** rather than manual snarkjs over email. It handles web-based contribution flow, transcript publishing, and attestations.
- Even with a perfect MPC Phase 2, you're trusting: (1) the Hermez Phase 1 participants, (2) at least one honest Phase 2 contributor, and (3) the beacon being unbiasable.
- Prefer audited circomlib templates (`IsZero`, `LessThan`, `Poseidon`) over hand-rolled logic.
````

