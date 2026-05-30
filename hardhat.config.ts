/**
 * Hardhat configuration for the SKP/USDT exploit reproduction.
 *
 * ── FORK TARGET ──────────────────────────────────────────────────────────────
 *
 * We fork BNB Smart Chain at block 100582078 — the block BEFORE the exploit
 * transaction (0xbc01ea37…).  This captures the exact on-chain state that the
 * attacker saw: pair reserves, SKP token state, and whitelisted addresses.
 *
 * ── CHAIN ID OVERRIDE: 31337 instead of 56 ───────────────────────────────────
 *
 * Problem:
 *   Hardhat 2.28.6 ships with EDR (Rust-based EVM).  When you fork a chain,
 *   Hardhat builds a `chainOverrides` object that includes a `hardforks` field
 *   mapping block numbers to hardfork names (the activation history).  EDR's
 *   Rust type, however, expects this field to be named
 *   `hardforkActivationOverrides`, not `hardforks`.  The name mismatch means
 *   the activation history is silently discarded, leaving EDR without any
 *   hardfork schedule for BSC (chainId 56).
 *
 *   Consequence: the first eth_call or eth_sendTransaction whose internal
 *   blockNumber equals forkBlockNumber (100582078) triggers `selectHardfork()`,
 *   which throws:
 *     "No known hardfork for execution on historical block 100582078
 *      (relative to fork block number 100582078). The node was not configured
 *      with a hardfork activation history."
 *
 * Solution (this file):
 *   Set chainId: 31337 (Hardhat's own default).  EDR has a built-in hardfork
 *   schedule for chain 31337, so the missing BSC schedule is never needed.
 *   The remaining workaround — calling `evm_mine` once at the start of each
 *   test — ensures all calls execute at block 100582079 (> forkBlockNumber),
 *   so selectHardfork() returns `currentHardfork` immediately without
 *   consulting any chain-specific schedule.
 *
 * Safety:
 *   No deployed contract in this PoC reads block.chainid.  All fork state
 *   (reserves, storage, bytecode) comes from the BSC RPC regardless of the
 *   chainId Hardhat assigns locally.
 *
 * ── RPC ENDPOINT ─────────────────────────────────────────────────────────────
 *
 * Ankr's public BSC RPC is used here with a project key embedded in the URL.
 * Replace with your own endpoint if this key is rate-limited or revoked.
 * Recommended alternatives: QuickNode, Infura BSC, NodeReal, or self-hosted.
 *
 * Archive node requirement:
 *   Block 100582078 is older than ~128 blocks, so a standard (pruned) node
 *   will not have it.  The RPC endpoint MUST be an archive node.
 *   Typical storage cost for a BSC archive node: 8–12 TB as of 2025.
 */

import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@solarity/hardhat-zkit";

const config: HardhatUserConfig = {
  solidity: "0.8.28",

  networks: {
    hardhat: {
      /**
       * Use Hardhat's own chain ID (31337) instead of BSC's (56).
       * This makes EDR fall back to its built-in hardfork schedule and avoids
       * the "No known hardfork" error described above.
       */
      chainId: 31337,

      forking: {
        /**
         * BSC archive RPC via Ankr.
         * Must support eth_getStorageAt and debug_traceTransaction at historical blocks.
         * The URL contains an API key — treat it as a secret in production.
         */
        url: "https://rpc.ankr.com/bsc/e50b7205ee2948db054c07d6f719b9da57c04baeb8cf158152bcdd33a6a81a4b",

        /**
         * Fork at the block BEFORE the exploit transaction.
         * Exploit tx is in block 100582079; forking 100582078 gives us the
         * pre-attack state with all original reserves and balances intact.
         */
        blockNumber: 100582078,
      },
    },
  },
};

export default config;
