import { ethers } from "hardhat";

const SKP = "0xecbdc0b76142740bb564b8aa1bcd061cb151a666";

async function main() {
  await ethers.provider.send("evm_mine", []);
  
  console.log("=== SKP storage scan (block 100582078) ===");
  for (let i = 0; i <= 30; i++) {
    const v = await ethers.provider.getStorage(SKP, i);
    if (v !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log(`slot ${i.toString().padStart(2,'0')}: ${v}`);
    }
  }
}
main().catch(console.error);
