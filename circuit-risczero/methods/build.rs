use risc0_build::{DockerOptionsBuilder, GuestOptionsBuilder};
use std::collections::HashMap;

fn main() {
    // Check if we should use Docker-built deterministic binaries
    let use_docker = std::env::var("RISC0_USE_DOCKER").is_ok();

    if use_docker {
        // Configure to use Docker-built binaries from docker/ subdirectory
        // Set root_dir to ".." so Docker can access the core dependency
        let docker_opts = DockerOptionsBuilder::default()
            .root_dir("..")
            .build()
            .unwrap();

        let guest_opts = GuestOptionsBuilder::default()
            .use_docker(docker_opts)
            .build()
            .unwrap();

        // Apply to all guest packages (maze-gen and path-verify)
        let methods_map = HashMap::from([
            ("maze-gen", guest_opts.clone()),
            ("path-verify", guest_opts),
        ]);

        risc0_build::embed_methods_with_options(methods_map);
    } else {
        // Use standard build (will compile guest code if needed)
        risc0_build::embed_methods();
    }

    println!("cargo:rerun-if-env-changed=RISC0_USE_DOCKER");
}
