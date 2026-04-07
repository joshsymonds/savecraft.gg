use std::process::Command;

/// Run datagen against real game data and verify output files.
#[test]
fn generate_tech_and_building_data() {
    let input_dir = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../gamedata/common"
    );
    let output_dir = std::env::temp_dir().join("stellaris-datagen-test");
    let _ = std::fs::remove_dir_all(&output_dir);
    std::fs::create_dir_all(&output_dir).unwrap();

    let output = Command::new(env!("CARGO_BIN_EXE_stellaris-datagen"))
        .args(["--input", input_dir, "--output", &output_dir.to_string_lossy()])
        .output()
        .expect("failed to run datagen");

    assert!(
        output.status.success(),
        "datagen failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    // Verify types.rs was generated
    let types_path = output_dir.join("types.rs");
    assert!(types_path.exists(), "types.rs not generated");
    let types_content = std::fs::read_to_string(&types_path).unwrap();
    assert!(
        types_content.contains("pub struct Tech"),
        "types.rs should define Tech struct"
    );
    assert!(
        types_content.contains("pub struct Building"),
        "types.rs should define Building struct"
    );

    // Verify techs_gen.rs was generated with real data
    let techs_path = output_dir.join("techs_gen.rs");
    assert!(techs_path.exists(), "techs_gen.rs not generated");
    let techs_content = std::fs::read_to_string(&techs_path).unwrap();
    assert!(
        techs_content.contains("tech_lasers_1"),
        "should contain tech_lasers_1"
    );
    assert!(
        techs_content.contains("tech_destroyers"),
        "should contain tech_destroyers"
    );
    assert!(
        techs_content.contains("physics"),
        "should contain physics area"
    );
    assert!(
        techs_content.contains("engineering"),
        "should contain engineering area"
    );
    // Should have many techs
    let tech_count = techs_content.matches("Tech {").count();
    assert!(
        tech_count > 100,
        "expected >100 techs, got {tech_count}"
    );

    // Verify buildings_gen.rs was generated with real data
    let buildings_path = output_dir.join("buildings_gen.rs");
    assert!(buildings_path.exists(), "buildings_gen.rs not generated");
    let buildings_content = std::fs::read_to_string(&buildings_path).unwrap();
    assert!(
        buildings_content.contains("building_colony_shelter"),
        "should contain building_colony_shelter"
    );
    let building_count = buildings_content.matches("Building {").count();
    assert!(
        building_count > 30,
        "expected >30 buildings, got {building_count}"
    );

    // Cleanup
    let _ = std::fs::remove_dir_all(&output_dir);
}
