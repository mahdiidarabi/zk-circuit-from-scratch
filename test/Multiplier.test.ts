import { expect } from "chai";
import { ethers, zkit } from "hardhat";

describe("Multiplier circuit", () => {
  let circuit: any;

  before(async () => {
    circuit = await zkit.getCircuit("Multiplier");
  });

  describe("On-chain verification", () => {
    async function deployVerifier() {
      const VerifierFactory = await ethers.getContractFactory(
        "MultiplierGroth16Verifier"
      );
      return await VerifierFactory.deploy();
    }

    it("accepts a valid proof with correct public signal", async () => {
      const verifier = await deployVerifier();

      // Prove we know 3 * 7 = 21
      const proof = await circuit.generateProof({ a: 3n, b: 7n });
      const calldata = await circuit.generateCalldata(proof);

      const result = await verifier.verifyProof(
        calldata.proofPoints.a,
        calldata.proofPoints.b,
        calldata.proofPoints.c,
        calldata.publicSignals
      );

      expect(result).to.equal(true);
      // Sanity check: the public signal really is 21
      expect(BigInt(calldata.publicSignals[0])).to.equal(21n);
    });

    it("accepts a different valid proof", async () => {
      const verifier = await deployVerifier();

      // Different factorization: 5 * 11 = 55
      const proof = await circuit.generateProof({ a: 5n, b: 11n });
      const calldata = await circuit.generateCalldata(proof);

      const result = await verifier.verifyProof(
        calldata.proofPoints.a,
        calldata.proofPoints.b,
        calldata.proofPoints.c,
        calldata.publicSignals
      );

      expect(result).to.equal(true);
      expect(BigInt(calldata.publicSignals[0])).to.equal(55n);
    });

    it("rejects a proof when the public signal is tampered", async () => {
      const verifier = await deployVerifier();

      const proof = await circuit.generateProof({ a: 3n, b: 7n });
      const calldata = await circuit.generateCalldata(proof);

      // The real product is 21. Lie and claim it's 22.
      const tamperedSignals: [bigint] = [22n];

      const result = await verifier.verifyProof(
        calldata.proofPoints.a,
        calldata.proofPoints.b,
        calldata.proofPoints.c,
        tamperedSignals
      );

      expect(result).to.equal(false);
    });

    it("rejects a proof when the proof points are tampered", async () => {
      const verifier = await deployVerifier();

      const proof = await circuit.generateProof({ a: 3n, b: 7n });
      const calldata = await circuit.generateCalldata(proof);

      // Flip one byte of the proof's A point
      const tamperedA: [bigint, bigint] = [
        BigInt(calldata.proofPoints.a[0]) + 1n,
        BigInt(calldata.proofPoints.a[1]),
      ];

      const result = await verifier.verifyProof(
        tamperedA,
        calldata.proofPoints.b,
        calldata.proofPoints.c,
        calldata.publicSignals
      );

      expect(result).to.equal(false);
    });

    it("rejects a proof reused with a different claimed product", async () => {
      const verifier = await deployVerifier();

      // Generate proof for 3 * 7 = 21
      const proofFor21 = await circuit.generateProof({ a: 3n, b: 7n });
      const calldata21 = await circuit.generateCalldata(proofFor21);

      // Generate proof for 5 * 11 = 55
      const proofFor55 = await circuit.generateProof({ a: 5n, b: 11n });
      const calldata55 = await circuit.generateCalldata(proofFor55);

      // Try to use proof-21's points with proof-55's public signals
      const result = await verifier.verifyProof(
        calldata21.proofPoints.a,
        calldata21.proofPoints.b,
        calldata21.proofPoints.c,
        calldata55.publicSignals
      );

      expect(result).to.equal(false);
    });
  });

  describe("Circuit-level constraints", () => {
    it("rejects a trivial factorization where a = 1", async () => {
      // The NonTrivial template should make this fail at proof generation,
      // because the constraint (in - 1) * inv === 1 is unsatisfiable when in == 1.
      await expect(
        circuit.generateProof({ a: 1n, b: 42n })
      ).to.be.rejected;
    });

    it("rejects a trivial factorization where b = 1", async () => {
      await expect(
        circuit.generateProof({ a: 42n, b: 1n })
      ).to.be.rejected;
    });
  });
});