#![allow(dead_code)] // Input structs deserialize all fields but diagnostics only read some
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

// ─── Input Types (deserialized from injected save sections) ─────────────────

#[derive(Deserialize, Default)]
struct OverviewSection {
    military_power: Option<f64>,
    resources: Option<HashMap<String, f64>>,
}

#[derive(Deserialize, Default)]
struct EconomySection {
    net: Option<HashMap<String, f64>>,
    expenses_by_category: Option<HashMap<String, HashMap<String, f64>>>,
}

#[derive(Deserialize, Default)]
struct PlanetsSection {
    colonies: Option<Vec<Colony>>,
}

#[derive(Deserialize)]
struct Colony {
    planet_id: Option<i64>,
    planet_class: Option<String>,
    designation: Option<String>,
    num_pops: Option<i64>,
    stability: Option<f64>,
    crime: Option<f64>,
    amenities: Option<f64>,
    amenities_usage: Option<f64>,
    free_housing: Option<f64>,
    total_housing: Option<f64>,
}

#[derive(Deserialize, Default)]
struct MilitarySection {
    military_power: Option<f64>,
    fleet_size: Option<i64>,
    used_naval_capacity: Option<i64>,
    empire_size: Option<i64>,
}

#[derive(Deserialize, Default)]
struct WarsSection {
    active_wars: Option<Vec<WarEntry>>,
    player_at_war: Option<bool>,
}

#[derive(Deserialize)]
struct WarEntry {
    war_id: Option<String>,
    start_date: Option<String>,
    attacker_war_goal: Option<String>,
    defender_war_goal: Option<String>,
    attacker_war_exhaustion: Option<f64>,
    defender_war_exhaustion: Option<f64>,
    player_side: Option<String>,
}

#[derive(Deserialize, Default)]
struct DiplomacySection {
    relations: Option<Vec<DiplomacyRelation>>,
    casus_belli: Option<Vec<CasusBelliEntry>>,
}

#[derive(Deserialize)]
struct DiplomacyRelation {
    country: Option<i64>,
    opinion: Option<f64>,
    hostile: Option<bool>,
    trust: Option<f64>,
    has_communications: Option<bool>,
    closed_borders: Option<bool>,
}

#[derive(Deserialize)]
struct CasusBelliEntry {
    cb_type: Option<String>,
    target_country: Option<i64>,
}

#[derive(Deserialize, Default)]
struct FactionsSection {
    factions: Option<Vec<FactionEntry>>,
}

#[derive(Deserialize)]
struct FactionEntry {
    faction_id: Option<String>,
    faction_type: Option<String>,
    support: Option<f64>,
    happiness: Option<f64>,
}

#[derive(Deserialize, Default)]
struct ThreatsSection {
    crisis_active: Option<bool>,
    crisis_type: Option<String>,
    crisis_countries: Option<Vec<ThreatCountry>>,
    fallen_empires: Option<Vec<FallenEmpireEntry>>,
    hostile_neighbors: Option<Vec<HostileNeighborEntry>>,
}

#[derive(Deserialize)]
struct HostileNeighborEntry {
    country_id: Option<String>,
    military_power: Option<f64>,
    cb_types: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct ThreatCountry {
    country_id: Option<String>,
    country_type: Option<String>,
    military_power: Option<f64>,
}

#[derive(Deserialize)]
struct FallenEmpireEntry {
    country_id: Option<String>,
    country_type: Option<String>,
    awakened: Option<bool>,
    military_power: Option<f64>,
}

// ─── Output Types (matching the Svelte view's data schema) ──────────────────

#[derive(Serialize)]
struct EmpireHealthOutput {
    summary: Summary,
    economy: EconomyOutput,
    stability: StabilityOutput,
    military: MilitaryOutput,
    politics: PoliticsOutput,
    threats: ThreatsOutput,
}

#[derive(Serialize)]
struct Summary {
    critical: usize,
    severe: usize,
    moderate: usize,
    healthy_dimensions: usize,
}

#[derive(Serialize)]
struct EconomyOutput {
    problems: Vec<EconomyProblem>,
}

#[derive(Serialize)]
struct EconomyProblem {
    resource: String,
    severity: String,
    net_per_month: f64,
    stockpile: f64,
    runway_months: Option<i64>,
    top_expenses: Vec<ExpenseCategory>,
}

#[derive(Serialize)]
struct ExpenseCategory {
    category: String,
    amount: f64,
}

#[derive(Serialize)]
struct StabilityOutput {
    problem_count: usize,
    worst_stability: f64,
    planets: Vec<PlanetProblem>,
}

#[derive(Serialize)]
struct PlanetProblem {
    name: String,
    severity: String,
    stability: f64,
    free_housing: f64,
    crime: f64,
    amenities_surplus: f64,
    issues: Vec<String>,
}

#[derive(Serialize)]
struct MilitaryOutput {
    naval_used: i64,
    fleet_size: i64,
    wars: Vec<WarProblem>,
}

#[derive(Serialize)]
struct WarProblem {
    name: String,
    player_side: String,
    war_exhaustion: f64,
    severity: String,
}

#[derive(Serialize)]
struct PoliticsOutput {
    factions: Vec<FactionProblem>,
}

#[derive(Serialize)]
struct FactionProblem {
    name: String,
    faction_type: String,
    happiness: f64,
    support: f64,
    severity: String,
}

#[derive(Serialize)]
struct ThreatsOutput {
    crisis_active: bool,
    crisis_type: Option<String>,
    hostile_empires: Vec<HostileEmpire>,
}

#[derive(Serialize)]
struct HostileEmpire {
    name: String,
    severity: String,
    reason: String,
    military_power: f64,
    player_military_power: f64,
    power_ratio: f64,
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

/// Main resources we care about for economy diagnosis.
const KEY_RESOURCES: &[&str] = &[
    "energy",
    "minerals",
    "food",
    "alloys",
    "consumer_goods",
    "volatile_motes",
    "exotic_gases",
    "rare_crystals",
    "unity",
];

fn prettify_key(key: &str) -> String {
    key.split('_')
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(c) => {
                    let upper: String = c.to_uppercase().collect();
                    upper + chars.as_str()
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn diagnose_economy(
    economy: &EconomySection,
    overview: &OverviewSection,
) -> EconomyOutput {
    let net = economy.net.as_ref();
    let stockpiles = overview.resources.as_ref();
    let expenses_by_cat = economy.expenses_by_category.as_ref();

    let mut problems = Vec::new();

    for &resource in KEY_RESOURCES {
        let net_val = net.and_then(|n| n.get(resource)).copied().unwrap_or(0.0);
        let stockpile = stockpiles.and_then(|s| s.get(resource)).copied().unwrap_or(0.0);

        // Compute runway: months until stockpile depleted
        let runway_months = if net_val < 0.0 && stockpile > 0.0 {
            Some((stockpile / net_val.abs()).floor() as i64)
        } else if net_val < 0.0 {
            // Already at zero stockpile
            None
        } else {
            // Not in deficit — no runway needed
            None
        };

        let severity = if net_val >= 0.0 {
            "healthy"
        } else if runway_months.is_none() || runway_months == Some(0) {
            // Zero stockpile or immediate depletion
            "critical"
        } else if runway_months.unwrap() < 6 {
            "critical"
        } else if runway_months.unwrap() < 24 {
            "severe"
        } else {
            "moderate"
        };

        // Get top expense categories for this resource
        let mut top_expenses: Vec<ExpenseCategory> = Vec::new();
        if severity != "healthy" {
            if let Some(cat_map) = expenses_by_cat {
                let mut resource_expenses: Vec<(&String, &f64)> = cat_map
                    .iter()
                    .filter_map(|(cat, resources)| {
                        resources.get(resource).map(|amount| (cat, amount))
                    })
                    .filter(|(_, amount)| **amount > 0.0)
                    .collect();
                resource_expenses.sort_by(|a, b| {
                    b.1.partial_cmp(a.1).unwrap_or(std::cmp::Ordering::Equal)
                });
                top_expenses = resource_expenses
                    .into_iter()
                    .take(3)
                    .map(|(cat, amount)| ExpenseCategory {
                        category: cat.clone(),
                        amount: *amount,
                    })
                    .collect();
            }
        }

        // Only include resources that exist in the economy (skip strategic resources if zero income/expense)
        let has_data = net.map_or(false, |n| n.contains_key(resource));
        if has_data || stockpile > 0.0 {
            problems.push(EconomyProblem {
                resource: resource.to_string(),
                severity: severity.to_string(),
                net_per_month: net_val,
                stockpile,
                runway_months: if net_val < 0.0 { runway_months } else { None },
                top_expenses,
            });
        }
    }

    // Sort: deficits first (by severity), then healthy
    problems.sort_by(|a, b| {
        let sev_order = |s: &str| match s {
            "critical" => 0,
            "severe" => 1,
            "moderate" => 2,
            _ => 3,
        };
        sev_order(&a.severity).cmp(&sev_order(&b.severity))
    });

    EconomyOutput { problems }
}

fn diagnose_stability(planets: &PlanetsSection) -> StabilityOutput {
    let colonies = planets.colonies.as_deref().unwrap_or(&[]);
    let mut problem_planets: Vec<PlanetProblem> = Vec::new();
    let mut worst_stability: f64 = 100.0;

    for colony in colonies {
        let stability = colony.stability.unwrap_or(50.0);
        let crime = colony.crime.unwrap_or(0.0);
        let amenities = colony.amenities.unwrap_or(0.0);
        let amenities_usage = colony.amenities_usage.unwrap_or(0.0);
        let free_housing = colony.free_housing.unwrap_or(0.0);
        let amenities_surplus = amenities - amenities_usage;

        if stability < worst_stability {
            worst_stability = stability;
        }

        let mut issues = Vec::new();
        let mut worst_sev = 3u8; // 0=critical, 1=severe, 2=moderate, 3=healthy

        // Stability check
        if stability < 25.0 {
            issues.push("low_stability".to_string());
            worst_sev = worst_sev.min(0);
        } else if stability < 40.0 {
            issues.push("low_stability".to_string());
            worst_sev = worst_sev.min(1);
        } else if stability < 50.0 {
            issues.push("low_stability".to_string());
            worst_sev = worst_sev.min(2);
        }

        // Housing check
        if free_housing < -5.0 {
            issues.push("housing_shortage".to_string());
            worst_sev = worst_sev.min(0);
        } else if free_housing < 0.0 {
            issues.push("housing_shortage".to_string());
            worst_sev = worst_sev.min(1);
        } else if free_housing < 2.0 {
            issues.push("housing_shortage".to_string());
            worst_sev = worst_sev.min(2);
        }

        // Crime check
        if crime > 50.0 {
            issues.push("high_crime".to_string());
            worst_sev = worst_sev.min(0);
        } else if crime > 30.0 {
            issues.push("high_crime".to_string());
            worst_sev = worst_sev.min(1);
        } else if crime > 10.0 {
            issues.push("high_crime".to_string());
            worst_sev = worst_sev.min(2);
        }

        // Amenities check
        if amenities_surplus < -10.0 {
            issues.push("amenity_deficit".to_string());
            worst_sev = worst_sev.min(0);
        } else if amenities_surplus < 0.0 {
            issues.push("amenity_deficit".to_string());
            worst_sev = worst_sev.min(1);
        } else if amenities_surplus < 5.0 {
            issues.push("amenity_deficit".to_string());
            worst_sev = worst_sev.min(2);
        }

        if !issues.is_empty() {
            let severity = match worst_sev {
                0 => "critical",
                1 => "severe",
                2 => "moderate",
                _ => "healthy",
            };

            let name = colony
                .designation
                .as_deref()
                .map(prettify_key)
                .unwrap_or_else(|| {
                    format!("Planet {}", colony.planet_id.unwrap_or(0))
                });

            problem_planets.push(PlanetProblem {
                name,
                severity: severity.to_string(),
                stability,
                free_housing,
                crime,
                amenities_surplus,
                issues,
            });
        }
    }

    // Sort by severity then stability
    problem_planets.sort_by(|a, b| {
        let sev_order = |s: &str| match s {
            "critical" => 0,
            "severe" => 1,
            "moderate" => 2,
            _ => 3,
        };
        sev_order(&a.severity)
            .cmp(&sev_order(&b.severity))
            .then_with(|| {
                a.stability
                    .partial_cmp(&b.stability)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });

    let problem_count = problem_planets.len();
    StabilityOutput {
        problem_count,
        worst_stability,
        planets: problem_planets,
    }
}

fn diagnose_military(military: &MilitarySection, wars: &WarsSection) -> MilitaryOutput {
    let naval_used = military.used_naval_capacity.unwrap_or(0);
    let fleet_size = military.fleet_size.unwrap_or(0);

    let active_wars = wars.active_wars.as_deref().unwrap_or(&[]);
    let mut war_problems = Vec::new();

    for war in active_wars {
        let side = war.player_side.as_deref().unwrap_or("unknown");
        let exhaustion = match side {
            "attacker" => war.attacker_war_exhaustion.unwrap_or(0.0),
            _ => war.defender_war_exhaustion.unwrap_or(0.0),
        };

        let severity = if exhaustion > 75.0 {
            "critical"
        } else if exhaustion > 50.0 {
            "severe"
        } else if exhaustion > 25.0 {
            "moderate"
        } else {
            "healthy"
        };

        let name = war
            .attacker_war_goal
            .as_deref()
            .or(war.defender_war_goal.as_deref())
            .map(prettify_key)
            .unwrap_or_else(|| format!("War {}", war.war_id.as_deref().unwrap_or("?")));

        war_problems.push(WarProblem {
            name,
            player_side: side.to_string(),
            war_exhaustion: exhaustion,
            severity: severity.to_string(),
        });
    }

    // Sort wars by exhaustion descending
    war_problems.sort_by(|a, b| {
        b.war_exhaustion
            .partial_cmp(&a.war_exhaustion)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    MilitaryOutput {
        naval_used,
        fleet_size,
        wars: war_problems,
    }
}

fn diagnose_politics(factions: &FactionsSection) -> PoliticsOutput {
    let entries = factions.factions.as_deref().unwrap_or(&[]);
    let mut faction_problems = Vec::new();

    for f in entries {
        let happiness = f.happiness.unwrap_or(0.5);
        let support = f.support.unwrap_or(0.0);

        let severity = if happiness < 0.3 {
            "critical"
        } else if happiness < 0.5 {
            "moderate"
        } else {
            "healthy"
        };

        let name = f
            .faction_type
            .as_deref()
            .map(prettify_key)
            .unwrap_or_else(|| "Unknown Faction".to_string());

        faction_problems.push(FactionProblem {
            name,
            faction_type: f.faction_type.clone().unwrap_or_default(),
            happiness,
            support,
            severity: severity.to_string(),
        });
    }

    // Sort by happiness ascending (unhappiest first)
    faction_problems.sort_by(|a, b| {
        a.happiness
            .partial_cmp(&b.happiness)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    PoliticsOutput {
        factions: faction_problems,
    }
}

fn diagnose_threats(
    threats: &ThreatsSection,
    diplomacy: &DiplomacySection,
    player_military_power: f64,
) -> ThreatsOutput {
    let crisis_active = threats.crisis_active.unwrap_or(false);
    let crisis_type = threats.crisis_type.clone();

    let mut hostile_empires: Vec<HostileEmpire> = Vec::new();

    // Add crisis countries
    if let Some(crisis_countries) = &threats.crisis_countries {
        for c in crisis_countries {
            let mil = c.military_power.unwrap_or(0.0);
            let ratio = if player_military_power > 0.0 {
                mil / player_military_power
            } else {
                99.0
            };
            hostile_empires.push(HostileEmpire {
                name: c
                    .country_type
                    .as_deref()
                    .map(prettify_key)
                    .unwrap_or_else(|| "Crisis".to_string()),
                severity: "critical".to_string(),
                reason: "crisis".to_string(),
                military_power: mil,
                player_military_power,
                power_ratio: ratio,
            });
        }
    }

    // Add awakened fallen empires
    if let Some(fes) = &threats.fallen_empires {
        for fe in fes {
            if !fe.awakened.unwrap_or(false) {
                continue; // only flag awakened FEs as threats
            }
            let mil = fe.military_power.unwrap_or(0.0);
            let ratio = if player_military_power > 0.0 {
                mil / player_military_power
            } else {
                99.0
            };
            hostile_empires.push(HostileEmpire {
                name: format!(
                    "Awakened Empire #{}",
                    fe.country_id.as_deref().unwrap_or("?")
                ),
                severity: "severe".to_string(),
                reason: "awakened_fe".to_string(),
                military_power: mil,
                player_military_power,
                power_ratio: ratio,
            });
        }
    }

    // Add hostile neighbors — countries with CBs against the player (from threats section)
    if let Some(neighbors) = &threats.hostile_neighbors {
        for n in neighbors {
            let mil = n.military_power.unwrap_or(0.0);
            let ratio = if player_military_power > 0.0 {
                mil / player_military_power
            } else {
                99.0
            };
            hostile_empires.push(HostileEmpire {
                name: format!("Empire #{}", n.country_id.as_deref().unwrap_or("?")),
                severity: "critical".to_string(),
                reason: "casus_belli".to_string(),
                military_power: mil,
                player_military_power,
                power_ratio: ratio,
            });
        }
    }

    // Add diplomatic threats (hostile status, closed borders) from player's relations
    let relations = diplomacy.relations.as_deref().unwrap_or(&[]);
    for rel in relations {
        let country_id = match rel.country {
            Some(id) => id,
            None => continue,
        };
        let opinion = rel.opinion.unwrap_or(0.0);
        let hostile = rel.hostile.unwrap_or(false);
        let closed_borders = rel.closed_borders.unwrap_or(false);

        // Skip if already added as hostile neighbor (has CB)
        if threats.hostile_neighbors.as_ref().map_or(false, |ns| {
            ns.iter().any(|n| {
                n.country_id
                    .as_deref()
                    .and_then(|id| id.parse::<i64>().ok())
                    == Some(country_id)
            })
        }) {
            continue;
        }

        let (severity, reason) = if hostile {
            ("severe", "hostile")
        } else if closed_borders && opinion < -50.0 {
            ("moderate", "closed_borders_low_opinion")
        } else {
            continue;
        };

        hostile_empires.push(HostileEmpire {
            name: format!("Empire #{}", country_id),
            severity: severity.to_string(),
            reason: reason.to_string(),
            military_power: 0.0, // diplomacy doesn't have other empires' power
            player_military_power,
            power_ratio: 0.0,
        });
    }

    // Sort by severity then power ratio descending
    hostile_empires.sort_by(|a, b| {
        let sev_order = |s: &str| match s {
            "critical" => 0,
            "severe" => 1,
            "moderate" => 2,
            _ => 3,
        };
        sev_order(&a.severity)
            .cmp(&sev_order(&b.severity))
            .then_with(|| {
                b.power_ratio
                    .partial_cmp(&a.power_ratio)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });

    ThreatsOutput {
        crisis_active,
        crisis_type,
        hostile_empires,
    }
}

/// Count problems by severity across all dimensions.
fn count_problems(
    economy: &EconomyOutput,
    stability: &StabilityOutput,
    military: &MilitaryOutput,
    politics: &PoliticsOutput,
    threats: &ThreatsOutput,
) -> Summary {
    let mut critical = 0usize;
    let mut severe = 0usize;
    let mut moderate = 0usize;

    let all_severities = economy
        .problems
        .iter()
        .map(|p| p.severity.as_str())
        .chain(stability.planets.iter().map(|p| p.severity.as_str()))
        .chain(military.wars.iter().map(|w| w.severity.as_str()))
        .chain(politics.factions.iter().map(|f| f.severity.as_str()))
        .chain(threats.hostile_empires.iter().map(|e| e.severity.as_str()));

    for sev in all_severities {
        match sev {
            "critical" => critical += 1,
            "severe" => severe += 1,
            "moderate" => moderate += 1,
            _ => {}
        }
    }

    // Add naval over-capacity as a problem
    // (checked separately since it's not a list item)

    // Count healthy dimensions
    let mut healthy = 0usize;
    if economy.problems.iter().all(|p| p.severity == "healthy") {
        healthy += 1;
    }
    if stability.planets.is_empty() {
        healthy += 1;
    }
    if military.wars.iter().all(|w| w.severity == "healthy") {
        healthy += 1;
    }
    if politics.factions.iter().all(|f| f.severity == "healthy") {
        healthy += 1;
    }
    if threats.hostile_empires.is_empty() && !threats.crisis_active {
        healthy += 1;
    }

    Summary {
        critical,
        severe,
        moderate,
        healthy_dimensions: healthy,
    }
}

// ─── Entry Point ────────────────────────────────────────────────────────────

pub fn handle(query: &Map<String, Value>) -> Value {
    // Deserialize injected section data
    let overview: OverviewSection = query
        .get("overview_data")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let economy: EconomySection = query
        .get("economy_data")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let planets: PlanetsSection = query
        .get("planets_data")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let military: MilitarySection = query
        .get("military_data")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let wars: WarsSection = query
        .get("wars_data")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let diplomacy: DiplomacySection = query
        .get("diplomacy_data")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let factions: FactionsSection = query
        .get("factions_data")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let threats_section: ThreatsSection = query
        .get("threats_data")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let player_military_power = overview.military_power.unwrap_or(0.0);

    // Run diagnostics
    let economy_out = diagnose_economy(&economy, &overview);
    let stability_out = diagnose_stability(&planets);
    let military_out = diagnose_military(&military, &wars);
    let politics_out = diagnose_politics(&factions);
    let threats_out = diagnose_threats(&threats_section, &diplomacy, player_military_power);

    let summary = count_problems(&economy_out, &stability_out, &military_out, &politics_out, &threats_out);

    let output = EmpireHealthOutput {
        summary,
        economy: economy_out,
        stability: stability_out,
        military: military_out,
        politics: politics_out,
        threats: threats_out,
    };

    serde_json::to_value(&output).unwrap_or(json!({"error": "serialization failed"}))
}
