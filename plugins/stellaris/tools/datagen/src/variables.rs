use std::collections::HashMap;
use std::path::Path;

/// Load scripted variable definitions from all .txt files in a directory.
/// Variables are lines like `@tier0cost1 = 500`.
pub fn load_variables(dir: &Path, vars: &mut HashMap<String, String>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("txt") {
            continue;
        }
        load_variables_from_file(&path, vars);
    }
}

/// Load variables from all .txt files in a directory (for inline @var definitions).
pub fn load_variables_from_dir(dir: &Path, vars: &mut HashMap<String, String>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("txt") {
            continue;
        }
        load_variables_from_file(&path, vars);
    }
}

fn load_variables_from_file(path: &Path, vars: &mut HashMap<String, String>) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return,
    };
    for line in content.lines() {
        let trimmed = line.trim();
        // Variable lines start with @ and contain =
        if let Some(rest) = trimmed.strip_prefix('@') {
            if let Some((name, value)) = rest.split_once('=') {
                let name = name.trim();
                let value = value.trim();
                // Only store simple numeric values
                if !name.is_empty() && !value.is_empty() {
                    vars.insert(format!("@{name}"), value.to_string());
                }
            }
        }
    }
}

/// Resolve a value that might be a @variable reference.
pub fn resolve(value: &str, vars: &HashMap<String, String>) -> String {
    if value.starts_with('@') {
        vars.get(value).cloned().unwrap_or_else(|| value.to_string())
    } else {
        value.to_string()
    }
}

/// Resolve a value to an integer, resolving @variables first.
pub fn resolve_i32(value: &str, vars: &HashMap<String, String>) -> i32 {
    let resolved = resolve(value, vars);
    resolved.parse().unwrap_or(0)
}

/// Escape a string for embedding in Rust source code.
pub fn escape_rust_str(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}
