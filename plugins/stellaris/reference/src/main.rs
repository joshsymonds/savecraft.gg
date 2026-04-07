mod data;

use std::io::Read;

fn main() {
    let mut input = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut input) {
        eprintln!("failed to read stdin: {e}");
        std::process::exit(1);
    }

    // Verify data is embedded
    eprintln!(
        "stellaris-reference: {} techs, {} buildings loaded",
        data::techs_gen::TECHS.len(),
        data::buildings_gen::BUILDINGS.len()
    );

    // TODO: Parse query JSON from stdin, dispatch to reference modules.
    // Empty query should return the self-describing schema.
    eprintln!("stellaris-reference not yet implemented");
    std::process::exit(1);
}
