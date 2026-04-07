pub mod tech_search;
pub mod tech_path;
pub mod building_search;
pub mod component_search;
pub mod simple_search;
pub mod tradition_search;
pub mod trait_search;
pub mod civic_search;
pub mod edict_search;
pub mod job_search;

use serde_json::{json, Value};

pub fn schema() -> Value {
    json!({
        "modules": {
            "tech_search": {
                "name": "Technology Search",
                "description": "Search Stellaris technologies by name, area, tier, or category.",
                "parameters": {
                    "name": {"type": "string", "description": "Search by tech key substring"},
                    "area": {"type": "string", "description": "Filter by area: physics, society, engineering"},
                    "tier": {"type": "integer", "description": "Filter by tier (0-5)"},
                    "category": {"type": "string", "description": "Filter by category"},
                }
            },
            "tech_path": {
                "name": "Technology Path",
                "description": "Resolve the full prerequisite chain for a target technology. Returns topologically sorted prerequisites with researched/remaining annotations.",
                "parameters": {
                    "target": {"type": "string", "description": "Target tech key to resolve prerequisites for"},
                    "researched": {"type": "array", "description": "Optional array of already-researched tech keys to annotate the chain"},
                }
            },
            "building_search": {
                "name": "Building Search",
                "description": "Search Stellaris buildings by name or category.",
                "parameters": {
                    "name": {"type": "string", "description": "Search by building key substring"},
                    "category": {"type": "string", "description": "Filter by category"},
                }
            },
            "component_search": {
                "name": "Ship Component Search",
                "description": "Search ship weapons, utilities, reactors, and combat computers.",
                "parameters": {
                    "name": {"type": "string", "description": "Search by component key substring"},
                    "size": {"type": "string", "description": "Filter by size slot (small, medium, large, etc.)"},
                    "component_set": {"type": "string", "description": "Filter by component set"},
                }
            },
            "tradition_search": {
                "name": "Tradition & Ascension Perk Search",
                "description": "Search traditions and ascension perks by name.",
                "parameters": {
                    "name": {"type": "string", "description": "Search by key substring"},
                    "category": {"type": "string", "description": "Filter by category"},
                }
            },
            "trait_search": {
                "name": "Species & Leader Trait Search",
                "description": "Search species traits and leader traits by name or category.",
                "parameters": {
                    "name": {"type": "string", "description": "Search by trait key substring"},
                    "category": {"type": "string", "description": "Filter by category"},
                }
            },
            "civic_search": {
                "name": "Civic & Origin Search",
                "description": "Search civics and origins by name.",
                "parameters": {
                    "name": {"type": "string", "description": "Search by civic/origin key substring"},
                    "category": {"type": "string", "description": "Filter by category"},
                }
            },
            "edict_search": {
                "name": "Edict & Policy Search",
                "description": "Search edicts and policies by name.",
                "parameters": {
                    "name": {"type": "string", "description": "Search by edict key substring"},
                    "category": {"type": "string", "description": "Filter by category"},
                }
            },
            "job_search": {
                "name": "Pop Job Search",
                "description": "Search pop jobs by name or category.",
                "parameters": {
                    "name": {"type": "string", "description": "Search by job key substring"},
                    "category": {"type": "string", "description": "Filter by category (worker, specialist, ruler)"},
                }
            }
        }
    })
}
