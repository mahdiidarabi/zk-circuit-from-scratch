import { ethers } from "hardhat";

const SKP     = "0xecbdc0b76142740bb564b8aa1bcd061cb151a666";
const PAIR    = "0x47c8c3b123de467892ac7df6dfcf7ca3db901733";
const USDT    = "0x55d398326f99059ff775485246999027b3197955";
const WL      = ethers.getAddress("0x646f7bb10d81ff9734510d4e7583eb5247b28743");

async function main() {
  await ethers.provider.send("evm_mine", []);
  
  const erc20 = ["function balanceOf(address) view returns (uint256)"];
  const pairAbi = ["function getReserves() view returns (uint112,uint112,uint32)",
                   "function token0() view returns (address)",
                   "function token1() view returns (address)"];
  const skp  = new ethers.Contract(SKP,  erc20, ethers.provider);
  const usdt = new ethers.Contract(USDT, erc20, ethers.provider);
  const pair = new ethers.Contract(PAIR, pairAbi, ethers.provider);
  
  // Snapshot BEFORE
  const [r0_b, r1_b] = await pair.getReserves();
  const pairSkpBal_b = await skp.balanceOf(PAIR);
  const wlSkpBal_b = await skp.balanceOf(WL);
  console.log("=== BEFORE ===");
  console.log("Pair reserves:  USDT", ethers.formatUnits(r0_b, 18), " SKP", ethers.formatUnits(r1_b, 18));
  console.log("Pair SKP bal:  ", ethers.formatUnits(pairSkpBal_b, 18));
  console.log("WL buyer SKP bal:", ethers.formatUnits(wlSkpBal_b, 18));
  
  // Impersonate pair and do tiny transfer to WL
  await ethers.provider.send("hardhat_impersonateAccount", [PAIR]);
  await ethers.provider.send("hardhat_setBalance", [PAIR, "0x56BC75E2D63100000"]);
  const pairSigner = await ethers.getSigner(PAIR);
  const skpAsPair = new ethers.Contract(SKP, [...erc20, "function transfer(address,uint256) returns (bool)"], pairSigner);
  
  const transferAmt = ethers.parseUnits("1", 18); // just 1 SKP
  await skpAsPair.transfer(WL, transferAmt);
  
  // Snapshot AFTER
  const [r0_a, r1_a] = await pair.getReserves();
  const pairSkpBal_a = await skp.balanceOf(PAIR);
  const wlSkpBal_a = await skp.balanceOf(WL);
  console.log("\n=== AFTER transferring 1 SKP from pair to WL ===");
  console.log("Pair reserves:  USDT", ethers.formatUnits(r0_a, 18), " SKP", ethers.formatUnits(r1_a, 18));
  console.log("Pair SKP bal:  ", ethers.formatUnits(pairSkpBal_a, 18));
  console.log("WL buyer SKP bal:", ethers.formatUnits(wlSkpBal_a, 18));
  console.log("WL SKP gained:", ethers.formatUnits(wlSkpBal_a - wlSkpBal_b, 18));
}
main().catch(console.error);
