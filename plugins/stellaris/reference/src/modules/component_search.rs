use serde_json::{json, Map, Value};

use crate::data::components_gen::COMPONENTS;
use super::simple_search::get_limit;

pub fn handle(query: &Map<String, Value>) -> Value {
    let name_filter = query.get("name").and_then(|v| v.as_str());
    let size_filter = query.get("size").and_then(|v| v.as_str());
    let component_set_filter = query.get("component_set").and_then(|v| v.as_str());
    let limit = get_limit(query);

    let results: Vec<Value> = COMPONENTS
        .iter()
        .filter(|c| {
            if let Some(name) = name_filter {
                if !c.key.to_ascii_lowercase().contains(&name.to_ascii_lowercase()) {
                    return false;
                }
            }
            if let Some(size) = size_filter {
                if !c.size.eq_ignore_ascii_case(size) {
                    return false;
                }
            }
            if let Some(cs) = component_set_filter {
                if !c.component_set.eq_ignore_ascii_case(cs) {
                    return false;
                }
            }
            true
        })
        .take(limit)
        .map(|c| {
            json!({
                "key": c.key,
                "size": c.size,
                "power": c.power,
                "component_set": c.component_set,
                "prerequisites": c.prerequisites,
            })
        })
        .collect();

    json!({"results": results, "count": results.len()})
}
