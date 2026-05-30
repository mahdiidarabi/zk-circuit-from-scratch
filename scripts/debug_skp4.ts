import { ethers } from "hardhat";

const SKP   = "0xecbdc0b76142740bb564b8aa1bcd061cb151a666";
const OWNER = ethers.getAddress("0x041f52bfe9f07503efc5e7d4d176336e48095d56");
const PAIR  = "0x47c8c3b123de467892ac7df6dfcf7ca3db901733";
const ATTACKER = ethers.getAddress("0x83b9e7edc5b3127e4853a4f4945b92aa88eef0c8");

async function main() {
  await ethers.provider.send("evm_mine", []);
  await ethers.provider.send("hardhat_impersonateAccount", [OWNER]);
  await ethers.provider.send("hardhat_setBalance", [OWNER, "0x56BC75E2D63100000"]);
  
  const ownerSigner = await ethers.getSigner(OWNER);
  const ERC20 = ["function balanceOf(address) view returns (uint256)",
                  "function transfer(address,uint256) returns (bool)"];

  // Try common "open trading" function selectors as owner
  const selectors: {[k:string]: string} = {
    "openTrading()":           "0x60d3ae1d",
    "enableTrading()":         "0x8a8c523c",
    "setTradingEnabled(bool)": "0xd9f0c8e8",
    "launch()":                "0x01339c21",
    "startTrading()":          "0x93e7e374",
    "setCanBuy(bool)":         "0x043b1f3b",
    "setBuyEnabled(bool)true": "0x" + ethers.AbiCoder.defaultAbiCoder().encode(["bytes4","bool"],["0x043b1f3b",true]).slice(2),
    "toggleBuy()":             "0xd11e3a38",
    "0xaa7d5817 ()":           "0xaa7d5817",
    "0x8a8c523c ()":           "0x8a8c523c",
    "0x9a3653b7 ()":           "0x9a3653b7",
  };
  
  for (const [name, data] of Object.entries(selectors)) {
    try {
      const tx = await ownerSigner.sendTransaction({ to: SKP, data });
      await tx.wait();
      
      // After calling, test if transfer works
      await ethers.provider.send("hardhat_impersonateAccount", [PAIR]);
      await ethers.provider.send("hardhat_setBalance", [PAIR, "0x56BC75E2D63100000"]);
      const pairSigner = await ethers.getSigner(PAIR);
      const skpAsPair = new ethers.Contract(SKP, ERC20, pairSigner);
      try {
        await skpAsPair.transfer(ATTACKER, ethers.parseUnits("100", 18));
        console.log(`${name}: ENABLED TRADING! ✓`);
        return;
      } catch {
        console.log(`${name}: called OK but trading still blocked`);
      }
    } catch(e: any) {
      // function doesn't exist
    }
  }
  console.log("No standard enable-trading function found. Need to decompile bytecode.");
}
main().catch(console.error);
