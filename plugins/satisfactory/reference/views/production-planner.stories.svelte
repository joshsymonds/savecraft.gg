<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ProductionPlanner from "./production-planner.svelte";

  const { Story } = defineMeta({
    title: "Satisfactory/ProductionPlanner",
    tags: ["autodocs"],
  });

  // All story data is REAL production_planner output captured from the
  // module against the generated game data tables.
</script>

<Story name="SmallPlan">
  <ProductionPlanner data={{
      "byproducts": [],
      "machinesByRecipe": [
        {
          "alternate": false,
          "building": "Smelter",
          "machines": 1.5,
          "machinesCeil": 2,
          "powerMW": 6,
          "recipe": "Iron Ingot",
          "recipeClassName": "Recipe_IngotIron_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 1.5,
          "machinesCeil": 2,
          "powerMW": 6,
          "recipe": "Iron Plate",
          "recipeClassName": "Recipe_IronPlate_C"
        }
      ],
      "notes": "Rates assume 100% clock and no somersloops. Machine counts are exact; machinesCeil rounds up. Re-plan with the recipes parameter ({itemClass: recipeClass}) to use an alternate.",
      "ratePerMinute": 30,
      "rawResources": [
        {
          "className": "Desc_OreIron_C",
          "name": "Iron Ore",
          "perMinute": 45
        }
      ],
      "target": "Iron Plate",
      "targetClassName": "Desc_IronPlate_C",
      "totalPowerMW": 12
    }} />
</Story>

<Story name="SaveAwarePlan">
  <ProductionPlanner data={{
      "byproducts": [],
      "machinesByRecipe": [
        {
          "alternate": false,
          "building": "Smelter",
          "existingMachines": 2,
          "machines": 5,
          "machinesCeil": 5,
          "powerMW": 20,
          "recipe": "Iron Ingot",
          "recipeClassName": "Recipe_IngotIron_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "existingMachines": 3,
          "machines": 5,
          "machinesCeil": 5,
          "powerMW": 20,
          "recipe": "Iron Plate",
          "recipeClassName": "Recipe_IronPlate_C",
          "unlockedAlternates": [
            "Alternate: Coated Iron Plate"
          ]
        }
      ],
      "notes": "Rates assume 100% clock and no somersloops. Machine counts are exact; machinesCeil rounds up. Re-plan with the recipes parameter ({itemClass: recipeClass}) to use an alternate.",
      "ratePerMinute": 100,
      "rawResources": [
        {
          "className": "Desc_OreIron_C",
          "name": "Iron Ore",
          "perMinute": 150
        }
      ],
      "target": "Iron Plate",
      "targetClassName": "Desc_IronPlate_C",
      "totalPowerMW": 40
    }} />
</Story>

<Story name="DeepEndgamePlan">
  <ProductionPlanner data={{
      "byproducts": [
        {
          "className": "Desc_LiquidFuel_C",
          "name": "Fuel",
          "perMinute": 201.33,
          "unit": "m3"
        },
        {
          "className": "Desc_Water_C",
          "name": "Water",
          "perMinute": 167.98,
          "unit": "m3"
        },
        {
          "className": "Desc_HeavyOilResidue_C",
          "name": "Heavy Oil Residue",
          "perMinute": 32,
          "unit": "m3"
        },
        {
          "className": "Desc_Silica_C",
          "name": "Silica",
          "perMinute": 80.42
        }
      ],
      "machinesByRecipe": [
        {
          "alternate": false,
          "building": "Blender",
          "machines": 0.89,
          "machinesCeil": 1,
          "powerMW": 67.01,
          "recipe": "Alternate: Distilled Silica",
          "recipeClassName": "Recipe_Alternate_Silica_Distilled_C"
        },
        {
          "alternate": false,
          "building": "Refinery",
          "machines": 1.61,
          "machinesCeil": 2,
          "powerMW": 48.25,
          "recipe": "Alumina Solution",
          "recipeClassName": "Recipe_AluminaSolution_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 1.37,
          "machinesCeil": 2,
          "powerMW": 5.47,
          "recipe": "Aluminum Casing",
          "recipeClassName": "Recipe_AluminumCasing_C"
        },
        {
          "alternate": false,
          "building": "Refinery",
          "machines": 0.8,
          "machinesCeil": 1,
          "powerMW": 24.13,
          "recipe": "Aluminum Scrap",
          "recipeClassName": "Recipe_AluminumScrap_C"
        },
        {
          "alternate": false,
          "building": "Assembler",
          "machines": 2.33,
          "machinesCeil": 3,
          "powerMW": 35,
          "recipe": "Alclad Aluminum Sheet",
          "recipeClassName": "Recipe_AluminumSheet_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 1,
          "machinesCeil": 1,
          "powerMW": 4,
          "recipe": "Cable",
          "recipeClassName": "Recipe_Cable_C"
        },
        {
          "alternate": false,
          "building": "Assembler",
          "machines": 1.07,
          "machinesCeil": 2,
          "powerMW": 16,
          "recipe": "Circuit Board",
          "recipeClassName": "Recipe_CircuitBoard_C"
        },
        {
          "alternate": false,
          "building": "Manufacturer",
          "machines": 0.8,
          "machinesCeil": 1,
          "powerMW": 44,
          "recipe": "Computer",
          "recipeClassName": "Recipe_Computer_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 2,
          "machinesCeil": 2,
          "powerMW": 8,
          "recipe": "Concrete",
          "recipeClassName": "Recipe_Concrete_C"
        },
        {
          "alternate": false,
          "building": "Blender",
          "machines": 1.17,
          "machinesCeil": 2,
          "powerMW": 87.5,
          "recipe": "Cooling System",
          "recipeClassName": "Recipe_CoolingSystem_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 5.8,
          "machinesCeil": 6,
          "powerMW": 23.2,
          "recipe": "Copper Sheet",
          "recipeClassName": "Recipe_CopperSheet_C"
        },
        {
          "alternate": false,
          "building": "Manufacturer",
          "machines": 1,
          "machinesCeil": 1,
          "powerMW": 55,
          "recipe": "Crystal Oscillator",
          "recipeClassName": "Recipe_CrystalOscillator_C"
        },
        {
          "alternate": false,
          "building": "Assembler",
          "machines": 0.83,
          "machinesCeil": 1,
          "powerMW": 12.5,
          "recipe": "Encased Industrial Beam",
          "recipeClassName": "Recipe_EncasedIndustrialBeam_C"
        },
        {
          "alternate": false,
          "building": "Blender",
          "machines": 0.67,
          "machinesCeil": 1,
          "powerMW": 50,
          "recipe": "Fused Modular Frame",
          "recipeClassName": "Recipe_FusedModularFrame_C"
        },
        {
          "alternate": false,
          "building": "Assembler",
          "machines": 1.87,
          "machinesCeil": 2,
          "powerMW": 28,
          "recipe": "Heat Sink",
          "recipeClassName": "Recipe_HeatSink_C"
        },
        {
          "alternate": false,
          "building": "Foundry",
          "machines": 3.22,
          "machinesCeil": 4,
          "powerMW": 51.47,
          "recipe": "Aluminum Ingot",
          "recipeClassName": "Recipe_IngotAluminum_C"
        },
        {
          "alternate": false,
          "building": "Smelter",
          "machines": 8.04,
          "machinesCeil": 9,
          "powerMW": 32.18,
          "recipe": "Copper Ingot",
          "recipeClassName": "Recipe_IngotCopper_C"
        },
        {
          "alternate": false,
          "building": "Smelter",
          "machines": 16.63,
          "machinesCeil": 17,
          "powerMW": 66.5,
          "recipe": "Iron Ingot",
          "recipeClassName": "Recipe_IngotIron_C"
        },
        {
          "alternate": false,
          "building": "Foundry",
          "machines": 3.8,
          "machinesCeil": 4,
          "powerMW": 60.8,
          "recipe": "Steel Ingot",
          "recipeClassName": "Recipe_IngotSteel_C"
        },
        {
          "alternate": false,
          "building": "Assembler",
          "machines": 3,
          "machinesCeil": 3,
          "powerMW": 45,
          "recipe": "Reinforced Iron Plate",
          "recipeClassName": "Recipe_IronPlateReinforced_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 4.5,
          "machinesCeil": 5,
          "powerMW": 18,
          "recipe": "Iron Plate",
          "recipeClassName": "Recipe_IronPlate_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 24.25,
          "machinesCeil": 25,
          "powerMW": 97,
          "recipe": "Iron Rod",
          "recipeClassName": "Recipe_IronRod_C"
        },
        {
          "alternate": false,
          "building": "Refinery",
          "machines": 5.03,
          "machinesCeil": 6,
          "powerMW": 151,
          "recipe": "Fuel",
          "recipeClassName": "Recipe_LiquidFuel_C"
        },
        {
          "alternate": false,
          "building": "Manufacturer",
          "machines": 0.5,
          "machinesCeil": 1,
          "powerMW": 27.5,
          "recipe": "Heavy Modular Frame",
          "recipeClassName": "Recipe_ModularFrameHeavy_C"
        },
        {
          "alternate": false,
          "building": "Assembler",
          "machines": 2.5,
          "machinesCeil": 3,
          "powerMW": 37.5,
          "recipe": "Modular Frame",
          "recipeClassName": "Recipe_ModularFrame_C"
        },
        {
          "alternate": false,
          "building": "Manufacturer",
          "machines": 0.53,
          "machinesCeil": 1,
          "powerMW": 29.33,
          "recipe": "Turbo Motor",
          "recipeClassName": "Recipe_MotorTurbo_C"
        },
        {
          "alternate": false,
          "building": "Assembler",
          "machines": 1.8,
          "machinesCeil": 2,
          "powerMW": 27,
          "recipe": "Motor",
          "recipeClassName": "Recipe_Motor_C"
        },
        {
          "alternate": false,
          "building": "Refinery",
          "machines": 3.2,
          "machinesCeil": 4,
          "powerMW": 96,
          "recipe": "Plastic",
          "recipeClassName": "Recipe_Plastic_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 0.8,
          "machinesCeil": 1,
          "powerMW": 3.2,
          "recipe": "Quartz Crystal",
          "recipeClassName": "Recipe_QuartzCrystal_C"
        },
        {
          "alternate": false,
          "building": "Manufacturer",
          "machines": 0.8,
          "machinesCeil": 1,
          "powerMW": 44,
          "recipe": "Radio Control Unit",
          "recipeClassName": "Recipe_RadioControlUnit_C"
        },
        {
          "alternate": false,
          "building": "Refinery",
          "machines": 3.78,
          "machinesCeil": 4,
          "powerMW": 113.25,
          "recipe": "Residual Rubber",
          "recipeClassName": "Recipe_ResidualRubber_C"
        },
        {
          "alternate": false,
          "building": "Assembler",
          "machines": 5.75,
          "machinesCeil": 6,
          "powerMW": 86.25,
          "recipe": "Rotor",
          "recipeClassName": "Recipe_Rotor_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 21.88,
          "machinesCeil": 22,
          "powerMW": 87.5,
          "recipe": "Screws",
          "recipeClassName": "Recipe_Screw_C"
        },
        {
          "alternate": false,
          "building": "Assembler",
          "machines": 2.5,
          "machinesCeil": 3,
          "powerMW": 37.5,
          "recipe": "Smart Plating",
          "recipeClassName": "Recipe_SpaceElevatorPart_1_C"
        },
        {
          "alternate": false,
          "building": "Manufacturer",
          "machines": 2.5,
          "machinesCeil": 3,
          "powerMW": 137.5,
          "recipe": "Modular Engine",
          "recipeClassName": "Recipe_SpaceElevatorPart_4_C"
        },
        {
          "alternate": false,
          "building": "Manufacturer",
          "machines": 1,
          "machinesCeil": 1,
          "powerMW": 55,
          "recipe": "Thermal Propulsion Rocket",
          "recipeClassName": "Recipe_SpaceElevatorPart_8_C"
        },
        {
          "alternate": false,
          "building": "Assembler",
          "machines": 3.6,
          "machinesCeil": 4,
          "powerMW": 54,
          "recipe": "Stator",
          "recipeClassName": "Recipe_Stator_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 1,
          "machinesCeil": 1,
          "powerMW": 4,
          "recipe": "Steel Beam",
          "recipeClassName": "Recipe_SteelBeam_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 3.7,
          "machinesCeil": 4,
          "powerMW": 14.8,
          "recipe": "Steel Pipe",
          "recipeClassName": "Recipe_SteelPipe_C"
        },
        {
          "alternate": false,
          "building": "Constructor",
          "machines": 6.8,
          "machinesCeil": 7,
          "powerMW": 27.2,
          "recipe": "Wire",
          "recipeClassName": "Recipe_Wire_C"
        }
      ],
      "notes": "Rates assume 100% clock and no somersloops. Machine counts are exact; machinesCeil rounds up. Re-plan with the recipes parameter ({itemClass: recipeClass}) to use an alternate.",
      "ratePerMinute": 1,
      "rawResources": [
        {
          "className": "Desc_Water_C",
          "name": "Water",
          "perMinute": 564.85,
          "unit": "m3"
        },
        {
          "className": "Desc_LiquidOil_C",
          "name": "Crude Oil",
          "perMinute": 398,
          "unit": "m3"
        },
        {
          "className": "Desc_NitrogenGas_C",
          "name": "Nitrogen Gas",
          "perMinute": 200,
          "unit": "m3"
        },
        {
          "className": "Desc_DissolvedSilica_C",
          "name": "Dissolved Silica",
          "perMinute": 107.22,
          "unit": "m3"
        },
        {
          "className": "Desc_OreIron_C",
          "name": "Iron Ore",
          "perMinute": 669.75
        },
        {
          "className": "Desc_Coal_C",
          "name": "Coal",
          "perMinute": 267.5
        },
        {
          "className": "Desc_OreCopper_C",
          "name": "Copper Ore",
          "perMinute": 241.33
        },
        {
          "className": "Desc_OreBauxite_C",
          "name": "Bauxite",
          "perMinute": 193
        },
        {
          "className": "Desc_Stone_C",
          "name": "Limestone",
          "perMinute": 134.68
        },
        {
          "className": "Desc_RawQuartz_C",
          "name": "Raw Quartz",
          "perMinute": 30
        }
      ],
      "target": "Thermal Propulsion Rocket",
      "targetClassName": "Desc_SpaceElevatorPart_8_C",
      "totalPowerMW": 1911.53
    }} />
</Story>

<Story name="EmptyPlan">
  <ProductionPlanner data={{
    target: "Iron Plate",
    ratePerMinute: 0,
    machinesByRecipe: [],
    rawResources: [],
    byproducts: [],
    totalPowerMW: 0,
  }} />
</Story>
