import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@solarity/hardhat-zkit";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  zkit: {
    circuitsDir: "circuits",
    compilationSettings: {
      artifactsDir: "zkit/artifacts",
      onlyFiles: [],
      skipFiles: [],
    },
    setupSettings: {
      contributionSettings: {
        provingSystem: "groth16",
        contributions: 2,
      },
    },
    verifiersSettings: {
      verifiersDir: "contracts/verifiers",
      verifiersType: "sol",
    },
    quiet: false,
  },
};

export default config;
