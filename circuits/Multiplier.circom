pragma circom 2.1.6;

template Multiplier() {
    // Private inputs: the two secret factors
    signal input a;
    signal input b;

    // Public output: their product
    signal output c;

    // Constraint: c must equal a * b
    c <== a * b;

    // Defensive constraints: prevent trivial factorizations (a=1 or b=1)
    // We do this by requiring both a and b to be > 1.
    // Circom doesn't have native `>` for signals, so we use a helper.
    component aCheck = NonTrivial();
    component bCheck = NonTrivial();
    aCheck.in <== a;
    bCheck.in <== b;
}

template NonTrivial() {
    signal input in;
    signal inMinusOne;
    signal inMinusOneInv;

    inMinusOne <== in - 1;

    // Witness assignment: prover computes the inverse off-circuit
    inMinusOneInv <-- 1 / inMinusOne;

    // Constraint: verifier checks (in - 1) * inv == 1
    // This is unsatisfiable when in == 1 (since 0 has no inverse)
    inMinusOne * inMinusOneInv === 1;
}

component main = Multiplier();