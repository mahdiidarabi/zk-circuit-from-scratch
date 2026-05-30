import { ethers } from "hardhat";

async function main() {
  await ethers.provider.send("evm_mine", []);
  
  const USDT = "0x55d398326f99059ff775485246999027b3197955";
  // Venus vUSDT — known large USDT holder at block 100582078
  const WHALE = ethers.getAddress("0xfd5840cd36d94d7229439859c0112a4185bc0255");
  
  const usdt = new ethers.Contract(USDT, [
    "function balanceOf(address) external view returns (uint256)"
  ], ethers.provider);
  
  const balance = await usdt.balanceOf(WHALE);
  console.log("Whale USDT balance:", ethers.formatUnits(balance, 18));
  
  // Try slots 0-5 to find the _balances mapping slot
  for (let slot = 0; slot <= 5; slot++) {
    const storageKey = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256"],
        [WHALE, BigInt(slot)]
      )
    );
    const stored = await ethers.provider.getStorage(USDT, storageKey);
    const asNum = BigInt(stored);
    console.log(`slot ${slot}: ${ethers.formatUnits(asNum, 18)} USDT  (match=${asNum === balance})`);
  }
}

main().catch(console.error);
