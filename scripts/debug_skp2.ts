import { ethers } from "hardhat";

const SKP  = "0xecbdc0b76142740bb564b8aa1bcd061cb151a666";
const PAIR = "0x47c8c3b123de467892ac7df6dfcf7ca3db901733";
const ATTACK_CONTRACT = ethers.getAddress("0xe924853dcdfcb89292335042ab10d68c7315d7c1");
const RECIPIENT_046 = ethers.getAddress("0x646f7bb1b5d6f7be2c2e36eedfe99ed742e5b75d");

const ERC20 = ["function balanceOf(address) view returns (uint256)",
               "function transfer(address,uint256) returns (bool)"];

async function main() {
  await ethers.provider.send("evm_mine", []);
  await ethers.provider.send("hardhat_impersonateAccount", [PAIR]);
  await ethers.provider.send("hardhat_setBalance", [PAIR, "0x56BC75E2D63100000"]);
  const pairSigner = await ethers.getSigner(PAIR);
  const skpAsPair = new ethers.Contract(SKP, ERC20, pairSigner);
  
  const small = ethers.parseUnits("100", 18);
  
  for (const [label, addr] of [
    ["attack contract 0xe924", ATTACK_CONTRACT],
    ["recipient 0x646f", RECIPIENT_046],
  ]) {
    try {
      await skpAsPair.transfer(addr, small);
      console.log(`transfer to ${label}: SUCCESS`);
    } catch(e: any) {
      console.log(`transfer to ${label}: FAILED — ${e.message.slice(0,100)}`);
    }
  }
}
main().catch(console.error);
