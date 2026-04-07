use std::process::{Command, Stdio};
use std::io::Write;

fn run_query(query: &str) -> serde_json::Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_stellaris-reference"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("failed to run reference");

    child
        .stdin
        .take()
        .unwrap()
        .write_all(query.as_bytes())
        .unwrap();

    let output = child.wait_with_output().expect("failed to wait");
    assert!(
        output.status.success(),
        "reference failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8(output.stdout).expect("non-UTF8");
    let line = stdout.lines().next().expect("no output");
    serde_json::from_str(line).expect("invalid JSON")
}

#[test]
fn empty_query_returns_schema() {
    let result = run_query("{}");
    assert_eq!(result["type"], "result");
    let modules = &result["data"]["modules"];
    assert!(modules["tech_search"].is_object(), "tech_search missing from schema");
    assert!(modules["building_search"].is_object(), "building_search missing from schema");
    assert!(modules["component_search"].is_object(), "component_search missing from schema");
    assert!(modules["tradition_search"].is_object(), "tradition_search missing from schema");
    assert!(modules["trait_search"].is_object(), "trait_search missing from schema");
    assert!(modules["civic_search"].is_object(), "civic_search missing from schema");
    assert!(modules["edict_search"].is_object(), "edict_search missing from schema");
    assert!(modules["job_search"].is_object(), "job_search missing from schema");
}

#[test]
fn tech_search_by_name() {
    let result = run_query(r#"{"module": "tech_search", "name": "laser"}"#);
    assert_eq!(result["type"], "result");
    let techs = result["data"]["results"].as_array().expect("results should be array");
    assert!(!techs.is_empty(), "should find techs matching 'laser'");
    // All results should contain "laser" in the key
    for tech in techs {
        let key = tech["key"].as_str().unwrap();
        assert!(
            key.contains("laser"),
            "tech key '{key}' doesn't contain 'laser'"
        );
    }
}

#[test]
fn tech_search_by_area() {
    let result = run_query(r#"{"module": "tech_search", "area": "physics"}"#);
    assert_eq!(result["type"], "result");
    let techs = result["data"]["results"].as_array().expect("results should be array");
    assert!(techs.len() > 50, "expected many physics techs");
    for tech in techs {
        assert_eq!(tech["area"], "physics");
    }
}

#[test]
fn tech_search_by_tier() {
    let result = run_query(r#"{"module": "tech_search", "area": "engineering", "tier": 3}"#);
    assert_eq!(result["type"], "result");
    let techs = result["data"]["results"].as_array().expect("results should be array");
    assert!(!techs.is_empty(), "expected some tier 3 engineering techs");
    for tech in techs {
        assert_eq!(tech["area"], "engineering");
        assert_eq!(tech["tier"], 3);
    }
}

#[test]
fn tech_search_exact() {
    let result = run_query(r#"{"module": "tech_search", "name": "tech_destroyers"}"#);
    assert_eq!(result["type"], "result");
    let techs = result["data"]["results"].as_array().unwrap();
    assert_eq!(techs.len(), 1, "exact match should return 1 result");
    assert_eq!(techs[0]["key"], "tech_destroyers");
    assert_eq!(techs[0]["area"], "engineering");
    assert_eq!(techs[0]["tier"], 2);
    assert_eq!(techs[0]["cost"], 2000);
    let prereqs = techs[0]["prerequisites"].as_array().unwrap();
    assert!(prereqs.contains(&serde_json::json!("tech_corvettes")));
}

#[test]
fn building_search_by_name() {
    let result = run_query(r#"{"module": "building_search", "name": "foundry"}"#);
    assert_eq!(result["type"], "result");
    let buildings = result["data"]["results"].as_array().expect("results should be array");
    assert!(!buildings.is_empty(), "should find buildings matching 'foundry'");
    for b in buildings {
        let key = b["key"].as_str().unwrap();
        assert!(key.contains("foundry"), "building key '{key}' doesn't contain 'foundry'");
    }
}

#[test]
fn building_search_by_category() {
    let result = run_query(r#"{"module": "building_search", "category": "research"}"#);
    assert_eq!(result["type"], "result");
    let buildings = result["data"]["results"].as_array().expect("results should be array");
    assert!(!buildings.is_empty(), "expected some research buildings");
    for b in buildings {
        assert_eq!(b["category"], "research");
    }
}

#[test]
fn component_search_by_name() {
    let result = run_query(r#"{"module": "component_search", "name": "REACTOR"}"#);
    assert_eq!(result["type"], "result");
    let components = result["data"]["results"].as_array().unwrap();
    assert!(!components.is_empty(), "should find reactor components");
}

#[test]
fn tradition_search_by_name() {
    let result = run_query(r#"{"module": "tradition_search", "name": "expansion"}"#);
    assert_eq!(result["type"], "result");
    let traditions = result["data"]["results"].as_array().unwrap();
    assert!(!traditions.is_empty(), "should find expansion traditions");
}

#[test]
fn trait_search_by_name() {
    let result = run_query(r#"{"module": "trait_search", "name": "resilient"}"#);
    assert_eq!(result["type"], "result");
    let traits = result["data"]["results"].as_array().unwrap();
    assert!(!traits.is_empty(), "should find resilient trait");
}

#[test]
fn civic_search_by_name() {
    let result = run_query(r#"{"module": "civic_search", "name": "devouring_swarm"}"#);
    assert_eq!(result["type"], "result");
    let civics = result["data"]["results"].as_array().unwrap();
    assert!(!civics.is_empty(), "should find devouring swarm civic");
}

#[test]
fn edict_search_by_name() {
    let result = run_query(r#"{"module": "edict_search", "name": "fleet"}"#);
    assert_eq!(result["type"], "result");
    let edicts = result["data"]["results"].as_array().unwrap();
    assert!(!edicts.is_empty(), "should find fleet-related edicts");
}

#[test]
fn job_search_by_name() {
    let result = run_query(r#"{"module": "job_search", "name": "clerk"}"#);
    assert_eq!(result["type"], "result");
    let jobs = result["data"]["results"].as_array().unwrap();
    assert!(!jobs.is_empty(), "should find clerk job");
}
