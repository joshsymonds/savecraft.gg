use std::collections::{HashMap, HashSet, VecDeque};
use serde_json::{json, Map, Value};

use crate::data::techs_gen::TECHS;

/// Clausewitz script operators that leak into prerequisite arrays from datagen.
/// e.g. `prerequisites = { "tech_disruptors_3" OR "tech_lasers_5" }` produces
/// `["tech_disruptors_3", "OR", "tech_lasers_5"]`. Filter these out.
const SKIP_TOKENS: &[&str] = &["OR", "=", "AND"];

pub fn handle(query: &Map<String, Value>) -> Option<Value> {
    let target_key = query.get("target").and_then(|v| v.as_str())?;

    let tech_map: HashMap<&str, _> = TECHS.iter().map(|t| (t.key, t)).collect();

    let target = tech_map.get(target_key)?;

    // BFS to collect all transitive prerequisites
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();

    for &prereq in target.prerequisites {
        if !SKIP_TOKENS.contains(&prereq) && tech_map.contains_key(prereq) {
            queue.push_back(prereq);
        }
    }

    while let Some(key) = queue.pop_front() {
        if !visited.insert(key) {
            continue;
        }
        if let Some(tech) = tech_map.get(key) {
            for &prereq in tech.prerequisites {
                if !SKIP_TOKENS.contains(&prereq) && tech_map.contains_key(prereq) && !visited.contains(prereq) {
                    queue.push_back(prereq);
                }
            }
        }
    }

    // Topological sort via Kahn's algorithm (only over visited nodes).
    // Build adjacency list (prereq → successors) and in-degree counts in one pass.
    let mut in_degree: HashMap<&str, usize> = visited.iter().map(|&k| (k, 0)).collect();
    let mut successors: HashMap<&str, Vec<&str>> = HashMap::new();
    for &key in &visited {
        if let Some(tech) = tech_map.get(key) {
            for &prereq in tech.prerequisites {
                if !SKIP_TOKENS.contains(&prereq) && visited.contains(prereq) {
                    *in_degree.entry(key).or_default() += 1;
                    successors.entry(prereq).or_default().push(key);
                }
            }
        }
    }

    let mut topo_queue: VecDeque<&str> = in_degree
        .iter()
        .filter(|(_, deg)| **deg == 0)
        .map(|(k, _)| *k)
        .collect();
    let mut sorted = Vec::with_capacity(visited.len());

    while let Some(key) = topo_queue.pop_front() {
        sorted.push(key);
        if let Some(succs) = successors.get(key) {
            for &node in succs {
                if let Some(deg) = in_degree.get_mut(node) {
                    *deg = deg.saturating_sub(1);
                    if *deg == 0 {
                        topo_queue.push_back(node);
                    }
                }
            }
        }
    }

    // Build researched set from input
    let researched_set: HashSet<&str> = query
        .get("researched")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();

    let mut total_cost: i64 = 0;
    let mut remaining_cost: i64 = 0;

    let chain: Vec<Value> = sorted
        .iter()
        .map(|&key| {
            let tech = tech_map[key];
            let is_researched = researched_set.contains(key);
            total_cost += tech.cost as i64;
            if !is_researched {
                remaining_cost += tech.cost as i64;
            }
            json!({
                "key": tech.key,
                "area": tech.area,
                "tier": tech.tier,
                "cost": tech.cost,
                "researched": is_researched,
            })
        })
        .collect();

    Some(json!({
        "target": {
            "key": target.key,
            "area": target.area,
            "tier": target.tier,
            "cost": target.cost,
        },
        "chain": chain,
        "total_cost": total_cost,
        "remaining_cost": remaining_cost,
    }))
}
