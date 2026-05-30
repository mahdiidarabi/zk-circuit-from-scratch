import { ethers } from "hardhat";

const SKP  = "0xecbdc0b76142740bb564b8aa1bcd061cb151a666";
const PAIR = "0x47c8c3b123de467892ac7df6dfcf7ca3db901733";
// Address stored in slot 9 — the only allowed SKP buyer from the pair
const WHITELIST_BUYER = ethers.getAddress("0x646f7bb10d81ff9734510d4e7583eb5247b28743");

async function main() {
  await ethers.provider.send("evm_mine", []);
  await ethers.provider.send("hardhat_impersonateAccount", [PAIR]);
  await ethers.provider.send("hardhat_setBalance", [PAIR, "0x56BC75E2D63100000"]);
  const pairSigner = await ethers.getSigner(PAIR);
  const skp = new ethers.Contract(SKP, [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)",
  ], pairSigner);
  
  try {
    await skp.transfer(WHITELIST_BUYER, ethers.parseUnits("100", 18));
    console.log("Transfer to whitelisted buyer: SUCCESS ✓");
    
    const bal = await skp.balanceOf(WHITELIST_BUYER);
    console.log("Whitelist buyer SKP balance:", ethers.formatUnits(bal, 18));
  } catch(e: any) {
    console.log("Transfer to whitelist buyer: FAILED —", e.message.slice(0,120));
  }
}
main().catch(console.error);
