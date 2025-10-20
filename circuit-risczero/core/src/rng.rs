//! Park-Miller Linear Congruential Generator (MINSTD)
//!
//! This RNG implementation must exactly match the Python SimpleLCG in generate_maze.py
//! to ensure deterministic maze generation across platforms.
//!
//! Constants:
//! - Multiplier (a): 48271
//! - Modulus (m): 2^31 - 1 = 2147483647
//!
//! Reference: https://en.wikipedia.org/wiki/Lehmer_random_number_generator

#![allow(dead_code)]

/// Park-Miller Linear Congruential Generator
///
/// Generates a deterministic sequence of pseudo-random numbers from a seed.
/// Same seed always produces the same sequence.
pub struct SimpleLCG {
    state: u32,
}

impl SimpleLCG {
    /// Create a new LCG with the given seed
    ///
    /// If seed is 0, it's replaced with 1 to avoid degenerate sequence
    pub fn new(seed: u32) -> Self {
        Self {
            state: if seed == 0 { 1 } else { seed },
        }
    }

    /// Advance RNG state (internal)
    ///
    /// Updates state using Park-Miller algorithm
    fn advance(&mut self) {
        // Park-Miller constants
        const A: u64 = 48271;
        const M: u64 = 2147483647; // 2^31 - 1

        // Use u64 to avoid overflow during multiplication
        self.state = ((self.state as u64 * A) % M) as u32;
    }

    /// Generate random integer in range [a, b] (inclusive)
    ///
    /// Uses pure integer arithmetic - NO floating point operations
    /// Matches Python: `a + int(self.next() * (b - a + 1))`
    pub fn randint(&mut self, a: usize, b: usize) -> usize {
        const M: u64 = 2147483647; // 2^31 - 1
        self.advance();

        // Compute: a + (state * (b - a + 1)) / M using integer arithmetic
        let range = (b - a + 1) as u64;
        let scaled = (self.state as u64 * range) / M;
        a + scaled as usize
    }

    /// Choose random index from a range [0, len)
    ///
    /// Uses pure integer arithmetic - NO floating point operations
    /// Matches Python: `int(self.next() * len)`
    pub fn choice_index(&mut self, len: usize) -> usize {
        const M: u64 = 2147483647; // 2^31 - 1
        self.advance();

        // Compute: (state * len) / M using integer arithmetic
        let scaled = (self.state as u64 * len as u64) / M;
        scaled as usize
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test-only helper for floating-point compatibility testing
    // This does NOT compile into the guest binary - only used in tests
    impl SimpleLCG {
        fn next_f64(&mut self) -> f64 {
            const M: u64 = 2147483647; // 2^31 - 1
            self.advance();
            self.state as f64 / M as f64
        }
    }

    #[test]
    fn test_determinism() {
        let mut rng1 = SimpleLCG::new(12345);
        let mut rng2 = SimpleLCG::new(12345);

        for _ in 0..100 {
            let val1 = rng1.next_f64();
            let val2 = rng2.next_f64();
            assert!(
                (val1 - val2).abs() < 1e-10,
                "RNG not deterministic: {} != {}",
                val1,
                val2
            );
        }
    }

    #[test]
    fn test_seed_zero() {
        let mut rng = SimpleLCG::new(0);
        let val = rng.next_f64();
        assert!(val > 0.0 && val < 1.0, "Seed 0 should be replaced with 1");
    }

    #[test]
    fn test_range() {
        let mut rng = SimpleLCG::new(54321);

        for _ in 0..1000 {
            let val = rng.next_f64();
            assert!(val >= 0.0 && val < 1.0, "Value {} out of range [0, 1)", val);
        }
    }

    #[test]
    fn test_randint() {
        let mut rng = SimpleLCG::new(11111);

        for _ in 0..100 {
            let val = rng.randint(5, 10);
            assert!(val >= 5 && val <= 10, "randint {} not in [5, 10]", val);
        }
    }

    #[test]
    fn test_known_sequence() {
        // Test that same seed produces consistent sequence
        let mut rng1 = SimpleLCG::new(2918957128);
        let mut rng2 = SimpleLCG::new(2918957128);

        // Verify first 10 values match between two RNGs with same seed
        for _ in 0..10 {
            let val1 = rng1.next_f64();
            let val2 = rng2.next_f64();
            assert_eq!(val1, val2, "RNG sequence not deterministic");
        }
    }
}
