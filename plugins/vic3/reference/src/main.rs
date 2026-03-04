use std::io::Read;

fn main() {
    let mut input = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut input) {
        eprintln!("failed to read stdin: {e}");
        std::process::exit(1);
    }

    // TODO: Parse query JSON from stdin, dispatch to game_rules module.
    // Empty query should return the self-describing schema.
    eprintln!("vic3-reference not yet implemented");
    std::process::exit(1);
}
