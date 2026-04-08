use std::process::{Command, Stdio};
use std::io::Write;

fn run_query_allow_failure(query: &str) -> serde_json::Value {
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
    let stdout = String::from_utf8(output.stdout).expect("non-UTF8");
    let line = stdout.lines().next().expect("no output");
    serde_json::from_str(line).expect("invalid JSON")
}

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
    assert!(modules["empire_health"].is_object(), "empire_health missing from schema");
}

// --- empire_health tests ---

#[test]
fn empire_health_empty_sections() {
    // With no section data injected, should produce a healthy output with no problems
    let result = run_query(r#"{"module": "empire_health"}"#);
    assert_eq!(result["type"], "result");
    let data = &result["data"];
    assert_eq!(data["summary"]["critical"], 0);
    assert_eq!(data["summary"]["severe"], 0);
    assert_eq!(data["summary"]["moderate"], 0);
    assert_eq!(data["summary"]["healthy_dimensions"], 5);
    assert!(data["economy"]["problems"].as_array().unwrap().is_empty());
    assert!(data["stability"]["planets"].as_array().unwrap().is_empty());
    assert!(data["military"]["wars"].as_array().unwrap().is_empty());
    assert!(data["politics"]["factions"].as_array().unwrap().is_empty());
    assert!(data["threats"]["hostile_empires"].as_array().unwrap().is_empty());
    assert_eq!(data["threats"]["crisis_active"], false);
}

#[test]
fn empire_health_economy_deficit() {
    let result = run_query(r#"{
        "module": "empire_health",
        "overview_data": {
            "military_power": 50.0,
            "resources": { "energy": 100.0, "minerals": 5000.0 }
        },
        "economy_data": {
            "net": { "energy": -50.0, "minerals": 20.0 },
            "expenses_by_category": {
                "ship_maintenance": { "energy": 80.0 },
                "station_maintenance": { "energy": 30.0 }
            }
        }
    }"#);
    assert_eq!(result["type"], "result");
    let problems = result["data"]["economy"]["problems"].as_array().unwrap();
    // Energy should be a problem (net negative)
    let energy = problems.iter().find(|p| p["resource"] == "energy").unwrap();
    assert_eq!(energy["net_per_month"], -50.0);
    assert_eq!(energy["stockpile"], 100.0);
    assert_eq!(energy["runway_months"], 2); // 100 / 50 = 2
    assert_eq!(energy["severity"], "critical"); // runway < 6
    // Should have expense breakdown
    let expenses = energy["top_expenses"].as_array().unwrap();
    assert!(!expenses.is_empty());
    assert_eq!(expenses[0]["category"], "ship_maintenance");

    // Minerals should be healthy (net positive)
    let minerals = problems.iter().find(|p| p["resource"] == "minerals").unwrap();
    assert_eq!(minerals["severity"], "healthy");
}

#[test]
fn empire_health_stability_problems() {
    let result = run_query(r#"{
        "module": "empire_health",
        "planets_data": {
            "colonies": [
                {
                    "planet_id": 1,
                    "name": "Sol III",
                    "stability": 12.0,
                    "crime": 67.0,
                    "amenities": 10.0,
                    "amenities_usage": 25.0,
                    "free_housing": -8.0
                },
                {
                    "planet_id": 2,
                    "name": "Alpha Centauri I",
                    "stability": 80.0,
                    "crime": 2.0,
                    "amenities": 20.0,
                    "amenities_usage": 10.0,
                    "free_housing": 5.0
                }
            ]
        }
    }"#);
    assert_eq!(result["type"], "result");
    let planets = result["data"]["stability"]["planets"].as_array().unwrap();
    // Only the first planet should be a problem
    assert_eq!(planets.len(), 1);
    assert_eq!(planets[0]["name"], "Sol III");
    assert_eq!(planets[0]["severity"], "critical");
    let issues = planets[0]["issues"].as_array().unwrap();
    assert!(issues.contains(&serde_json::json!("low_stability")));
    assert!(issues.contains(&serde_json::json!("housing_shortage")));
    assert!(issues.contains(&serde_json::json!("high_crime")));
    assert!(issues.contains(&serde_json::json!("amenity_deficit")));
}

#[test]
fn empire_health_war_exhaustion() {
    let result = run_query(r#"{
        "module": "empire_health",
        "wars_data": {
            "active_wars": [
                {
                    "war_id": "1",
                    "attacker_war_goal": "wg_conquest",
                    "defender_war_goal": "wg_defend",
                    "attacker_war_exhaustion": 82.0,
                    "defender_war_exhaustion": 15.0,
                    "player_side": "attacker"
                }
            ],
            "player_at_war": true
        }
    }"#);
    assert_eq!(result["type"], "result");
    let wars = result["data"]["military"]["wars"].as_array().unwrap();
    assert_eq!(wars.len(), 1);
    assert_eq!(wars[0]["war_exhaustion"], 82.0);
    assert_eq!(wars[0]["severity"], "critical"); // > 75
    assert_eq!(wars[0]["player_side"], "attacker");
}

#[test]
fn empire_health_faction_severity_tiers() {
    let result = run_query(r#"{
        "module": "empire_health",
        "factions_data": {
            "factions": [
                { "faction_type": "xenoist", "happiness": 0.15, "support": 0.3 },
                { "faction_type": "militarist", "happiness": 0.35, "support": 0.2 },
                { "faction_type": "technologist", "happiness": 0.45, "support": 0.25 },
                { "faction_type": "egalitarian", "happiness": 0.72, "support": 0.25 }
            ]
        }
    }"#);
    assert_eq!(result["type"], "result");
    let factions = result["data"]["politics"]["factions"].as_array().unwrap();
    assert_eq!(factions.len(), 4);
    // Sorted by happiness ascending
    assert_eq!(factions[0]["severity"], "critical");  // 0.15 < 0.3
    assert_eq!(factions[1]["severity"], "severe");    // 0.35 < 0.4
    assert_eq!(factions[2]["severity"], "moderate");   // 0.45 < 0.5
    assert_eq!(factions[3]["severity"], "healthy");    // 0.72 >= 0.5
}

#[test]
fn empire_health_crisis_detection() {
    let result = run_query(r#"{
        "module": "empire_health",
        "overview_data": { "military_power": 50.0 },
        "threats_data": {
            "crisis_active": true,
            "crisis_type": "prethoryn_scourge",
            "crisis_countries": [
                { "country_id": "42", "country_type": "swarm", "military_power": 450.0 }
            ],
            "fallen_empires": [
                { "country_id": "7", "country_type": "awakened_fallen_empire", "awakened": true, "military_power": 280.0 }
            ],
            "hostile_neighbors": [
                { "country_id": "10", "military_power": 80.0, "cb_types": ["cb_claim"] }
            ]
        }
    }"#);
    assert_eq!(result["type"], "result");
    let data = &result["data"];
    assert_eq!(data["threats"]["crisis_active"], true);
    assert_eq!(data["threats"]["crisis_type"], "prethoryn_scourge");
    let hostiles = data["threats"]["hostile_empires"].as_array().unwrap();
    assert_eq!(hostiles.len(), 3);
    // Crisis country should be critical
    let crisis = hostiles.iter().find(|h| h["reason"] == "crisis").unwrap();
    assert_eq!(crisis["severity"], "critical");
    assert_eq!(crisis["military_power"], 450.0);
    assert_eq!(crisis["power_ratio"], 9.0); // 450 / 50
    // Awakened FE should be severe
    let awakened = hostiles.iter().find(|h| h["reason"] == "awakened_fe").unwrap();
    assert_eq!(awakened["severity"], "severe");
    // CB neighbor should be critical
    let cb = hostiles.iter().find(|h| h["reason"] == "casus_belli").unwrap();
    assert_eq!(cb["severity"], "critical");
    assert_eq!(cb["power_ratio"], 1.6); // 80 / 50
}

#[test]
fn empire_health_summary_counts() {
    let result = run_query(r#"{
        "module": "empire_health",
        "overview_data": { "military_power": 50.0, "resources": { "energy": 10.0 } },
        "economy_data": { "net": { "energy": -50.0 } },
        "planets_data": { "colonies": [{ "planet_id": 1, "stability": 12.0, "crime": 67.0, "amenities": 5.0, "amenities_usage": 20.0, "free_housing": -8.0 }] },
        "factions_data": { "factions": [{ "faction_type": "xenoist", "happiness": 0.15, "support": 0.3 }] }
    }"#);
    assert_eq!(result["type"], "result");
    let summary = &result["data"]["summary"];
    // Energy critical (runway ~0), planet critical, faction critical
    assert!(summary["critical"].as_i64().unwrap() >= 3, "expected at least 3 critical problems");
    assert_eq!(summary["healthy_dimensions"], 2); // military + threats are healthy
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
    let result = run_query(r#"{"module": "tech_search", "area": "physics", "limit": 500}"#);
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
    // Verify field structure
    let first = &components[0];
    assert!(first["key"].is_string(), "component should have key");
    assert!(first["size"].is_string(), "component should have size");
    assert!(first["power"].is_number(), "component should have power");
    assert!(first["component_set"].is_string(), "component should have component_set");
}

#[test]
fn tradition_search_by_name() {
    let result = run_query(r#"{"module": "tradition_search", "name": "expansion"}"#);
    assert_eq!(result["type"], "result");
    let traditions = result["data"]["results"].as_array().unwrap();
    assert!(!traditions.is_empty(), "should find expansion traditions");
    let first = &traditions[0];
    assert!(first["key"].as_str().unwrap().contains("expansion"));
}

#[test]
fn trait_search_by_name() {
    let result = run_query(r#"{"module": "trait_search", "name": "resilient"}"#);
    assert_eq!(result["type"], "result");
    let traits = result["data"]["results"].as_array().unwrap();
    assert!(!traits.is_empty(), "should find resilient trait");
    let first = &traits[0];
    assert!(first["key"].as_str().unwrap().contains("resilient"));
    assert!(first["cost"].is_number(), "trait should have cost");
}

#[test]
fn civic_search_by_name() {
    let result = run_query(r#"{"module": "civic_search", "name": "devouring_swarm"}"#);
    assert_eq!(result["type"], "result");
    let civics = result["data"]["results"].as_array().unwrap();
    assert!(!civics.is_empty(), "should find devouring swarm civic");
    let first = &civics[0];
    assert!(first["key"].as_str().unwrap().contains("devouring_swarm"));
    assert!(first["is_origin"].is_boolean(), "civic should have is_origin");
}

#[test]
fn edict_search_by_name() {
    let result = run_query(r#"{"module": "edict_search", "name": "fleet"}"#);
    assert_eq!(result["type"], "result");
    let edicts = result["data"]["results"].as_array().unwrap();
    assert!(!edicts.is_empty(), "should find fleet-related edicts");
    let first = &edicts[0];
    assert!(first["key"].as_str().unwrap().contains("fleet"));
}

#[test]
fn job_search_by_name() {
    let result = run_query(r#"{"module": "job_search", "name": "clerk"}"#);
    assert_eq!(result["type"], "result");
    let jobs = result["data"]["results"].as_array().unwrap();
    assert!(!jobs.is_empty(), "should find clerk job");
    let first = &jobs[0];
    assert!(first["key"].as_str().unwrap().contains("clerk"));
    assert!(first["category"].is_string(), "job should have category");
}

#[test]
fn unknown_module_returns_error() {
    let result = run_query_allow_failure(r#"{"module": "nonexistent"}"#);
    assert_eq!(result["type"], "error");
    assert_eq!(result["errorType"], "unknown_module");
}

// --- tech_path tests ---

#[test]
fn tech_path_no_prerequisites() {
    // tech_basic_industry is a start tech with no prerequisites
    let result = run_query(r#"{"module": "tech_path", "target": "tech_basic_industry"}"#);
    assert_eq!(result["type"], "result");
    let data = &result["data"];
    assert_eq!(data["target"]["key"], "tech_basic_industry");
    let chain = data["chain"].as_array().unwrap();
    assert!(chain.is_empty(), "start tech should have empty chain");
    assert_eq!(data["total_cost"], 0);
    assert_eq!(data["remaining_cost"], 0);
}

#[test]
fn tech_path_simple_chain() {
    // tech_destroyers requires tech_corvettes (a start tech)
    let result = run_query(r#"{"module": "tech_path", "target": "tech_destroyers"}"#);
    assert_eq!(result["type"], "result");
    let data = &result["data"];
    assert_eq!(data["target"]["key"], "tech_destroyers");
    let chain = data["chain"].as_array().unwrap();
    assert!(!chain.is_empty(), "should have prerequisites");
    // All chain entries should have required fields
    for entry in chain {
        assert!(entry["key"].is_string());
        assert!(entry["area"].is_string());
        assert!(entry["tier"].is_number());
        assert!(entry["cost"].is_number());
        assert!(entry["researched"].is_boolean());
    }
    // Without researched input, all should be false
    for entry in chain {
        assert_eq!(entry["researched"], false);
    }
}

#[test]
fn tech_path_with_researched() {
    let result = run_query(
        r#"{"module": "tech_path", "target": "tech_destroyers", "researched": ["tech_corvettes"]}"#,
    );
    assert_eq!(result["type"], "result");
    let data = &result["data"];
    let chain = data["chain"].as_array().unwrap();
    // tech_corvettes should be marked as researched
    let corvettes = chain.iter().find(|e| e["key"] == "tech_corvettes");
    assert!(corvettes.is_some(), "tech_corvettes should be in chain");
    assert_eq!(corvettes.unwrap()["researched"], true);
    // remaining_cost should be less than total_cost
    assert!(
        data["remaining_cost"].as_i64().unwrap() < data["total_cost"].as_i64().unwrap(),
        "remaining_cost should be less than total_cost when some techs are researched"
    );
}

#[test]
fn tech_path_unknown_target() {
    let result = run_query_allow_failure(r#"{"module": "tech_path", "target": "nonexistent_tech"}"#);
    assert_eq!(result["type"], "error");
}

#[test]
fn tech_path_missing_target() {
    let result = run_query_allow_failure(r#"{"module": "tech_path"}"#);
    assert_eq!(result["type"], "error");
}

#[test]
fn tech_path_deep_chain() {
    // tech_mega_engineering has multiple prerequisites: tech_battleships, tech_citadel_3, tech_zero_point_power
    // Each of those has its own chain. Verify the full chain is resolved.
    let result = run_query(r#"{"module": "tech_path", "target": "tech_mega_engineering"}"#);
    assert_eq!(result["type"], "result");
    let data = &result["data"];
    let chain = data["chain"].as_array().unwrap();
    assert!(chain.len() >= 3, "mega engineering should have at least 3 prerequisites in chain");
    // Verify topological order using known prerequisite relationships:
    // tech_corvettes -> tech_destroyers -> tech_cruisers -> tech_battleships
    let keys: Vec<&str> = chain.iter().map(|e| e["key"].as_str().unwrap()).collect();
    let pos = |key: &str| keys.iter().position(|k| *k == key);
    // Corvettes before destroyers
    if let (Some(a), Some(b)) = (pos("tech_corvettes"), pos("tech_destroyers")) {
        assert!(a < b, "tech_corvettes should appear before tech_destroyers");
    }
    // Destroyers before cruisers
    if let (Some(a), Some(b)) = (pos("tech_destroyers"), pos("tech_cruisers")) {
        assert!(a < b, "tech_destroyers should appear before tech_cruisers");
    }
    // Cruisers before battleships
    if let (Some(a), Some(b)) = (pos("tech_cruisers"), pos("tech_battleships")) {
        assert!(a < b, "tech_cruisers should appear before tech_battleships");
    }
    assert!(data["total_cost"].as_i64().unwrap() > 0);
}

#[test]
fn tech_path_schema_includes_tech_path() {
    let result = run_query("{}");
    assert_eq!(result["type"], "result");
    assert!(result["data"]["modules"]["tech_path"].is_object(), "tech_path missing from schema");
}

#[test]
fn case_insensitive_search() {
    let result = run_query(r#"{"module": "tech_search", "name": "Laser"}"#);
    assert_eq!(result["type"], "result");
    let techs = result["data"]["results"].as_array().unwrap();
    assert!(!techs.is_empty(), "case-insensitive search should find lasers");
}
