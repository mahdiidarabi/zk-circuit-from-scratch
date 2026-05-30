import { ethers } from "hardhat";

const SKP  = "0xecbdc0b76142740bb564b8aa1bcd061cb151a666";
const PAIR = "0x47c8c3b123de467892ac7df6dfcf7ca3db901733";
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const ATTACKER = ethers.getAddress("0x83b9e7edc5b3127e4853a4f4945b92aa88eef0c8");

async function main() {
  await ethers.provider.send("evm_mine", []);
  
  const erc20 = ["function balanceOf(address) view returns (uint256)",
                  "function transfer(address,uint256) returns (bool)"];
  const pairAbi = ["function getReserves() view returns (uint112,uint112,uint32)",
                   "function swap(uint256,uint256,address,bytes) external",
                   "function sync() external"];
  
  const skp  = new ethers.Contract(SKP,  erc20, ethers.provider);
  const pair = new ethers.Contract(PAIR, pairAbi, ethers.provider);
  
  const [r0, r1] = await pair.getReserves();
  console.log("Pair reserves: USDT", ethers.formatUnits(r0,18), "SKP", ethers.formatUnits(r1,18));
  
  const skpBal = await skp.balanceOf(PAIR);
  console.log("Pair SKP balance:", ethers.formatUnits(skpBal, 18));
  
  // Test 1: Can we call pair.sync() directly (outside of swap)?
  await ethers.provider.send("hardhat_impersonateAccount", [ATTACKER]);
  await ethers.provider.send("hardhat_setBalance", [ATTACKER, "0x56BC75E2D63100000"]);
  const signer = await ethers.getSigner(ATTACKER);
  
  try {
    const pairWithSigner = new ethers.Contract(PAIR, pairAbi, signer);
    await pairWithSigner.sync();
    console.log("pair.sync() outside swap: SUCCESS");
  } catch(e: any) {
    console.log("pair.sync() outside swap: FAILED", e.message.slice(0,80));
  }
  
  // Test 2: Small SKP transfer from pair (simulate what router does)
  // Impersonate pair to send SKP
  await ethers.provider.send("hardhat_impersonateAccount", [PAIR]);
  await ethers.provider.send("hardhat_setBalance", [PAIR, "0x56BC75E2D63100000"]);
  const pairSigner = await ethers.getSigner(PAIR);
  const skpAsPair = new ethers.Contract(SKP, erc20, pairSigner);
  
  try {
    const smallAmt = ethers.parseUnits("100", 18);
    await skpAsPair.transfer(ATTACKER, smallAmt);
    console.log("SKP.transfer(from=pair, to=attacker, 100): SUCCESS");
  } catch(e: any) {
    console.log("SKP.transfer(from=pair, to=attacker, 100): FAILED", e.message.slice(0,120));
  }
}

main().catch(console.error);
