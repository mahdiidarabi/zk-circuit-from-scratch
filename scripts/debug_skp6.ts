import { ethers } from "hardhat";

const SKP = "0xecbdc0b76142740bb564b8aa1bcd061cb151a666";
const PAIR = "0x47c8c3b123de467892ac7df6dfcf7ca3db901733";
const ATTACKER = ethers.getAddress("0x83b9e7edc5b3127e4853a4f4945b92aa88eef0c8");

async function main() {
  await ethers.provider.send("evm_mine", []);
  
  const block = await ethers.provider.getBlock("latest");
  console.log("Current block number:", block!.number);
  console.log("Current block timestamp:", block!.timestamp, "=", new Date(block!.timestamp * 1000).toISOString());
  
  // slot 13 = 0x6a15cf55 = 1779007317
  const slot13 = BigInt("0x6a15cf55");
  console.log("\nSlot 13 value:", slot13.toString(), "=", new Date(Number(slot13) * 1000).toISOString());
  console.log("Is block.timestamp > slot13?", block!.timestamp > Number(slot13));
  
  // Try manipulating block timestamp to be after slot 13
  console.log("\n--- Setting block timestamp to slot13 + 1 and retesting ---");
  await ethers.provider.send("evm_setNextBlockTimestamp", [Number(slot13) + 1]);
  await ethers.provider.send("evm_mine", []);
  
  const block2 = await ethers.provider.getBlock("latest");
  console.log("New block timestamp:", block2!.timestamp, "=", new Date(block2!.timestamp * 1000).toISOString());
  
  // Test transfer again
  await ethers.provider.send("hardhat_impersonateAccount", [PAIR]);
  await ethers.provider.send("hardhat_setBalance", [PAIR, "0x56BC75E2D63100000"]);
  const pairSigner = await ethers.getSigner(PAIR);
  const skpAsPair = new ethers.Contract(SKP, 
    ["function transfer(address,uint256) returns (bool)"], pairSigner);
  
  try {
    await skpAsPair.transfer(ATTACKER, ethers.parseUnits("100", 18));
    console.log("Transfer after timestamp advance: SUCCESS ✓");
  } catch(e: any) {
    console.log("Transfer still fails:", e.message.slice(0, 100));
  }
}
main().catch(console.error);
