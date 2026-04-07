use serde_json::{json, Map, Value};
use crate::data::components_gen::COMPONENTS;

pub fn handle(query: &Map<String, Value>) -> Value {
    let name_filter = query.get("name").and_then(|v| v.as_str());
    let size_filter = query.get("size").and_then(|v| v.as_str());
    let component_set_filter = query.get("component_set").and_then(|v| v.as_str());

    let results: Vec<Value> = COMPONENTS
        .iter()
        .filter(|c| {
            if let Some(name) = name_filter { if !c.key.contains(name) { return false; } }
            if let Some(size) = size_filter { if c.size != size { return false; } }
            if let Some(cs) = component_set_filter { if c.component_set != cs { return false; } }
            true
        })
        .map(|c| json!({"key": c.key, "size": c.size, "power": c.power, "component_set": c.component_set, "prerequisites": c.prerequisites}))
        .collect();

    json!({"results": results, "count": results.len()})
}
