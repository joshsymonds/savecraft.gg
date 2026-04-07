use serde_json::{json, Map, Value};

use crate::data::techs_gen::TECHS;

pub fn handle(query: &Map<String, Value>) -> Value {
    let name_filter = query.get("name").and_then(|v| v.as_str());
    let area_filter = query.get("area").and_then(|v| v.as_str());
    let tier_filter = query.get("tier").and_then(|v| v.as_i64()).map(|t| t as i32);
    let category_filter = query.get("category").and_then(|v| v.as_str());

    let results: Vec<Value> = TECHS
        .iter()
        .filter(|tech| {
            if let Some(name) = name_filter {
                if !tech.key.contains(name) {
                    return false;
                }
            }
            if let Some(area) = area_filter {
                if tech.area != area {
                    return false;
                }
            }
            if let Some(tier) = tier_filter {
                if tech.tier != tier {
                    return false;
                }
            }
            if let Some(cat) = category_filter {
                if tech.category != cat {
                    return false;
                }
            }
            true
        })
        .map(|tech| {
            json!({
                "key": tech.key,
                "area": tech.area,
                "tier": tech.tier,
                "cost": tech.cost,
                "category": tech.category,
                "prerequisites": tech.prerequisites,
                "is_start_tech": tech.is_start_tech,
                "is_repeatable": tech.is_repeatable,
                "weight": tech.weight,
            })
        })
        .collect();

    json!({
        "results": results,
        "count": results.len(),
    })
}
