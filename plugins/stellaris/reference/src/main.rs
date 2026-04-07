mod data;
mod modules;

use serde_json::{json, Value};
use std::io::{self, Read, Write};

fn main() {
    let mut input = String::new();
    if let Err(e) = io::stdin().read_to_string(&mut input) {
        write_error("read_error", &format!("failed to read stdin: {e}"));
        std::process::exit(1);
    }

    let query: Value = match serde_json::from_str(&input) {
        Ok(v) => v,
        Err(e) => {
            write_error("parse_error", &format!("invalid JSON query: {e}"));
            std::process::exit(1);
        }
    };

    let query_obj = match query.as_object() {
        Some(o) => o,
        None => {
            write_error("parse_error", "query must be a JSON object");
            std::process::exit(1);
        }
    };

    // Empty query → return schema
    if query_obj.is_empty() {
        write_result(modules::schema());
        return;
    }

    let module = query_obj
        .get("module")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let result = match module {
        "tech_search" => modules::tech_search::handle(query_obj),
        "building_search" => modules::building_search::handle(query_obj),
        "component_search" => modules::component_search::handle(query_obj),
        "tradition_search" => modules::tradition_search::handle_query(query_obj),
        "trait_search" => modules::trait_search::handle_query(query_obj),
        "civic_search" => modules::civic_search::handle_query(query_obj),
        "edict_search" => modules::edict_search::handle_query(query_obj),
        "job_search" => modules::job_search::handle_query(query_obj),
        _ => {
            write_error("unknown_module", &format!("unknown module: {module}"));
            std::process::exit(1);
        }
    };

    write_result(result);
}

fn write_result(data: Value) {
    let out = json!({"type": "result", "data": data});
    let mut stdout = io::stdout().lock();
    let _ = serde_json::to_writer(&mut stdout, &out);
    let _ = stdout.write_all(b"\n");
}

fn write_error(error_type: &str, message: &str) {
    let out = json!({"type": "error", "errorType": error_type, "message": message});
    let mut stdout = io::stdout().lock();
    let _ = serde_json::to_writer(&mut stdout, &out);
    let _ = stdout.write_all(b"\n");
}
