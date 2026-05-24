// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MultiplierGroth16Verifier} from "./verifiers/MultiplierGroth16Verifier.sol";

contract FactorizationChallenge {
    MultiplierGroth16Verifier public immutable verifier;

    mapping(uint256 => address) public solvers;

    event ChallengeSolved(uint256 indexed product, address indexed solver);

    constructor(address _verifier) {
        verifier = MultiplierGroth16Verifier(_verifier);
    }

    function solve(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[1] calldata pubSignals
    ) external {
        require(solvers[pubSignals[0]] == address(0), "Already solved");
        require(
            verifier.verifyProof(pA, pB, pC, pubSignals),
            "Invalid proof"
        );

        solvers[pubSignals[0]] = msg.sender;
        emit ChallengeSolved(pubSignals[0], msg.sender);
    }
}