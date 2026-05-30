import { ethers } from "hardhat";

const SKP  = "0xecbdc0b76142740bb564b8aa1bcd061cb151a666";
const ATTACKER_EOA = ethers.getAddress("0x83b9e7edc5b3127e4853a4f4945b92aa88eef0c8");

async function main() {
  await ethers.provider.send("evm_mine", []);
  
  // Try to read owner, trading state, and any relevant state vars
  const calls = [
    { name: "owner()",         sig: "0x8da5cb5b" },
    { name: "isBuyEnabled()",  sig: "0x2a5d9a19" },
    { name: "tradingOpen()",   sig: "0x7b726300" },
    { name: "isTrading()",     sig: "0x48b50b74" },
    { name: "_tradingOpen()",  sig: "0xb4b17d08" },
    { name: "openTrading()",   sig: "0x60d3ae1d" }, // just checking if it exists
  ];
  
  for (const c of calls) {
    try {
      const result = await ethers.provider.call({ to: SKP, data: c.sig });
      console.log(`${c.name}: ${result}`);
    } catch(e: any) {
      // silent - function doesn't exist or reverts
    }
  }
  
  // Check if attacker EOA is the owner by calling transferOwnership with it
  // (don't actually call, just check storage slot 0)
  const slot0 = await ethers.provider.getStorage(SKP, 0);
  const slot1 = await ethers.provider.getStorage(SKP, 1);
  const slot2 = await ethers.provider.getStorage(SKP, 2);
  const slot3 = await ethers.provider.getStorage(SKP, 3);
  console.log("slot 0:", slot0);
  console.log("slot 1:", slot1);
  console.log("slot 2:", slot2);
  console.log("slot 3:", slot3);
}
main().catch(console.error);
