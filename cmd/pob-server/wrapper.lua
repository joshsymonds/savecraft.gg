-- wrapper.lua — PoB headless wrapper with JSON-lines protocol over stdin/stdout
--
-- Loads Path of Building's HeadlessWrapper, then enters a read loop:
--   stdin:  one JSON object per line (requests)
--   stdout: one JSON object per line (responses)
--   stderr: status messages and errors for the Go supervisor
--
-- Request types:
--   {"type": "calc", "xml": "<build XML>"}
--   {"type": "ping"}
--
-- Response format:
--   {"type": "result", "data": { ... }}
--   {"type": "error", "message": "..."}

-- PoB source directory. The Go supervisor sets the working directory to this path,
-- so LoadModule's relative paths resolve correctly. POB_DIR is used only for
-- setting up package.path and locating HeadlessWrapper.
local pobDir = os.getenv("POB_DIR") or "."

-- Set up package path for PoB's runtime Lua libraries
package.path = pobDir .. "/?.lua;"
	.. pobDir .. "/?/init.lua;"
	.. pobDir .. "/../runtime/lua/?.lua;"
	.. pobDir .. "/../runtime/lua/?/init.lua;"
	.. package.path

-- Stub native C modules before anything loads them
package.preload['lua-utf8'] = function()
	return {
		reverse = string.reverse,
		gsub = string.gsub,
		find = string.find,
		sub = string.sub,
		len = string.len,
	}
end

-- Patch missing C API functions that HeadlessWrapper doesn't define.
-- HeadlessWrapper defines most stubs (SetMainObject, ConPrintf, etc.)
-- so we only add what's truly missing.
function GetVirtualScreenSize() return 1920, 1080 end

-- Status output goes to stderr so it doesn't mix with JSON protocol
local function log(fmt, ...)
	io.stderr:write(string.format(fmt, ...) .. "\n")
	io.stderr:flush()
end

-- Redirect print() to stderr so PoB's ConPrintf doesn't corrupt the JSON protocol.
-- This is NOT a modification to PoB source — it's a global override in our wrapper
-- that takes effect before HeadlessWrapper loads.
local _print = print
print = function(...)
	local args = {...}
	local parts = {}
	for i = 1, select("#", ...) do
		parts[#parts + 1] = tostring(args[i])
	end
	io.stderr:write(table.concat(parts, "\t") .. "\n")
	io.stderr:flush()
end

log("Loading PoB from %s...", pobDir)

-- Load PoB's HeadlessWrapper (stubs UI, loads Launch.lua -> Main.lua -> all data).
-- The Go supervisor sets the working directory to the PoB source directory,
-- so relative paths in LoadModule resolve correctly.
local loadOk, loadErr = pcall(dofile, pobDir .. "/HeadlessWrapper.lua")
if not loadOk then
	log("FATAL: Failed to load HeadlessWrapper: %s", tostring(loadErr))
	os.exit(1)
end

log("PoB loaded successfully")

-- JSON library is available from PoB's runtime
local dkjson = require("dkjson")

-- =========================================================================
-- Human-readable label mappings for PoB internal values
-- =========================================================================

local banditLabels = {
	None = "Kill All",
	Oak = "Help Oak",
	Kraityn = "Help Kraityn",
	Alira = "Help Alira",
}

local pantheonMajorLabels = {
	None = "None",
	TheBrineKing = "Soul of the Brine King",
	Lunaris = "Soul of Lunaris",
	Solaris = "Soul of Solaris",
	Arakaali = "Soul of Arakaali",
}

local pantheonMinorLabels = {
	None = "None",
	Gruthkul = "Soul of Gruthkul",
	Yugul = "Soul of Yugul",
	Abberath = "Soul of Abberath",
	Tukohama = "Soul of Tukohama",
	Garukhan = "Soul of Garukhan",
	Ralakesh = "Soul of Ralakesh",
	Ryslatha = "Soul of Ryslatha",
	Shakari = "Soul of Shakari",
}

-- Keys in configTab.input that are serialized in the character object, not in config.
local configCharacterKeys = {
	bandit = true,
	pantheonMajorGod = true,
	pantheonMinorGod = true,
}

-- Serialize the build's character info with human-readable labels.
local function serializeCharacter(build)
	local banditRaw = (build.configTab and build.configTab.input.bandit) or build.bandit or "None"
	local majorRaw = (build.configTab and build.configTab.input.pantheonMajorGod) or build.pantheonMajorGod or "None"
	local minorRaw = (build.configTab and build.configTab.input.pantheonMinorGod) or build.pantheonMinorGod or "None"
	return {
		class = build.spec.curClassName,
		ascendancy = build.spec.curAscendClassName,
		level = build.characterLevel,
		bandit = banditLabels[banditRaw] or banditRaw,
		pantheon_major = pantheonMajorLabels[majorRaw] or majorRaw,
		pantheon_minor = pantheonMinorLabels[minorRaw] or minorRaw,
	}
end

-- Serialize all non-default configTab inputs (excluding character keys).
local function serializeConfig(build)
	if not build.configTab or not build.configTab.input then return nil end
	local config = {}
	local hasEntries = false
	for k, v in pairs(build.configTab.input) do
		if not configCharacterKeys[k] and v ~= false and v ~= 0 and v ~= "" then
			config[k] = v
			hasEntries = true
		end
	end
	if not hasEntries then return nil end
	return config
end

-- Inject config section into grouped sections if non-empty.
local function injectConfigSection(grouped, build)
	local config = serializeConfig(build)
	if config then
		grouped.sections.config = config
		grouped.section_index[#grouped.section_index + 1] = {
			id = "config",
			name = "Configuration",
			description = "Active configuration overrides (conditions, enemy settings, combat state)",
		}
	end
end

-- Serialize socket groups (skills) from the build
-- Map grantedEffect.color (1=str, 2=dex, 3=int) to socket color letter.
local gemColorMap = { [1] = "R", [2] = "G", [3] = "B" }

local function serializeSocketGroups(build)
	local groups = {}
	if not build.skillsTab or not build.skillsTab.socketGroupList then
		return groups
	end

	-- Look up the item for a slot to get socket colors.
	local function getItemSockets(slotName)
		if not slotName or slotName == "" then return nil end
		if not build.itemsTab or not build.itemsTab.slots then return nil end
		local slot = build.itemsTab.slots[slotName]
		if not slot or not slot.selItemId or slot.selItemId <= 0 then return nil end
		local item = build.itemsTab.items[slot.selItemId]
		return item and item.sockets
	end

	for i, group in ipairs(build.skillsTab.socketGroupList) do
		local gems = {}
		local itemSockets = getItemSockets(group.slot)
		if group.gemList then
			for j, gem in ipairs(group.gemList) do
				local gemInfo = {
					nameSpec = gem.nameSpec or "",
					level = gem.level,
					quality = gem.quality,
					qualityId = gem.qualityId,
					enabled = gem.enabled,
					skillId = gem.skillId,
				}

				-- Socket color: from the item socket this gem sits in, or from gem attribute.
				if itemSockets and itemSockets[j] then
					gemInfo.socketColor = itemSockets[j].color
				end

				if gem.grantedEffect then
					gemInfo.name = gem.grantedEffect.name
					gemInfo.support = gem.grantedEffect.support or false
					gemInfo.color = gemColorMap[gem.grantedEffect.color] or "W"
					gemInfo.description = gem.grantedEffect.description
					gemInfo.castTime = gem.grantedEffect.castTime
					gemInfo.hasGlobalEffect = gem.grantedEffect.hasGlobalEffect or false
				end

				if gem.gemData then
					gemInfo.tags = gem.gemData.tagString
					gemInfo.reqStr = gem.gemData.reqStr
					gemInfo.reqDex = gem.gemData.reqDex
					gemInfo.reqInt = gem.gemData.reqInt
					gemInfo.naturalMaxLevel = gem.gemData.naturalMaxLevel
					if gem.gemData.vaalGem or gem.gemData.VaalGem then
						gemInfo.vaal = true
					end
				end

				gems[#gems + 1] = gemInfo
			end
		end
		groups[#groups + 1] = {
			label = group.label or "",
			enabled = group.enabled,
			slot = group.slot or "",
			gems = gems,
			isMainGroup = (i == build.mainSocketGroup),
		}
	end
	return groups
end

-- Serialize equipped items from the build
local function serializeItems(build)
	local items = {}
	if not build.itemsTab then return items end
	for slotName, slot in pairs(build.itemsTab.slots) do
		if slot.selItemId and slot.selItemId > 0 then
			local item = build.itemsTab.items[slot.selItemId]
			if item then
				-- Serialize socket layout: array of {color, group} for link visualization.
				local sockets
				if item.sockets and #item.sockets > 0 then
					sockets = {}
					for _, s in ipairs(item.sockets) do
						sockets[#sockets + 1] = { color = s.color, group = s.group }
					end
				end
				local entry = {
					name = item.title or item.name or item.baseName or "Unknown",
					baseName = item.baseName,
					rarity = item.rarity,
					type = item.type,
					sockets = sockets,
				}
				-- Include mod text for non-unique items (rares, magics).
				-- Unique mods are known by name; rare mods are the item.
				if item.rarity ~= "UNIQUE" and item.rarity ~= "RELIC" then
					local mods = {}
					if item.implicitModLines then
						for _, ml in ipairs(item.implicitModLines) do
							if ml.line then mods[#mods + 1] = ml.line end
						end
					end
					if item.explicitModLines then
						for _, ml in ipairs(item.explicitModLines) do
							if ml.line then mods[#mods + 1] = ml.line end
						end
					end
					if #mods > 0 then
						entry.mods = mods
					end
				end
				items[slotName] = entry
			end
		end
	end
	return items
end

-- Serialize tree keystones from the build
local function serializeKeystones(build)
	local keystones = {}
	if not build.spec or not build.spec.allocNodes then return keystones end
	for id, node in pairs(build.spec.allocNodes) do
		if node.isKeystone then
			keystones[#keystones + 1] = node.dn or node.name or tostring(id)
		end
	end
	table.sort(keystones)
	return keystones
end

-- Serialize tree allocation summary
local function serializeTreeSummary(build)
	if not build.spec then return {} end
	-- CountAllocNodes separates regular vs ascendancy vs class-start nodes
	local used, ascUsed = build.spec:CountAllocNodes()
	local output = build.calcsTab and build.calcsTab.mainOutput
	local extra = output and output.ExtraPoints or 0
	-- 23 quest reward passive points (all acts complete). PoB assumes this too
	-- (Build.lua:863: usedMax = 99 + 23 + extra). The acts table is local to
	-- Build.lua so we hardcode the same constant.
	local levelPoints = build.characterLevel - 1
	local questPoints = 23
	local available = levelPoints + questPoints + extra
	return {
		version = build.spec.treeVersion,
		allocated_nodes = used,
		ascendancy_nodes = ascUsed,
		level_points = levelPoints,
		quest_points = questPoints,
		extra_points = extra,
		available_points = available,
		remaining_points = available - used,
	}
end

-- =========================================================================
-- Stat section system
-- =========================================================================

-- Summary: fixed set of headline stats, always returned.
-- Per-element HitAverage keys show damage composition after all conversion and
-- "gain as extra" mechanics — zero-value elements are stripped after building
-- the summary (see the filter loop below serializeSections).
local summaryKeys = {
	"CombinedDPS", "TotalDPS",
	"PhysicalHitAverage", "FireHitAverage", "ColdHitAverage",
	"LightningHitAverage", "ChaosHitAverage",
	"Life", "LifeUnreserved", "LifeUnreservedPercent",
	"EnergyShield", "Mana", "Armour", "Evasion",
	"FireResist", "ColdResist", "LightningResist", "ChaosResist",
	"BlockChance", "SpellSuppressionChance", "MovementSpeedMod",
	"Str", "Dex", "Int",
	"FlaskEffect", "FlaskChargeGen",
	"LootQuantityNormalEnemies", "LootRarityMagicEnemies",
	"EnemyCurseLimit",
}

-- Per-element keys that should be stripped from the summary when zero.
-- Other summary keys (Life, Armour, etc.) always appear even if zero.
local summaryPerElementKeys = {
	"PhysicalHitAverage", "FireHitAverage", "ColdHitAverage",
	"LightningHitAverage", "ChaosHitAverage",
}

-- Curated key lists per stat section. These are the keys shown by default.
-- Other non-zero keys classified into the section appear in _extra_keys for
-- progressive disclosure — the LLM can request them via the stat_keys param.
local sectionCuratedKeys = {
	offense = {
		"CombinedDPS", "TotalDPS", "AverageDamage", "AverageHit",
		"PhysicalHitAverage", "FireHitAverage", "ColdHitAverage",
		"LightningHitAverage", "ChaosHitAverage",
		"Speed", "CritChance", "CritMultiplier", "CritEffect",
		"HitChance", "ProjectileCount", "PierceChance",
		"AreaOfEffectMod", "Duration", "Cooldown", "ManaCost",
	},
	ailments = {
		"TotalDotDPS", "BleedDPS", "BleedChance",
		"PoisonDPS", "PoisonChance", "TotalPoisonDPS",
		"IgniteDPS", "IgniteChance",
		"DecayDPS", "BurningGroundDPS",
		"PhysicalDot", "FireDot", "ColdDot", "LightningDot", "ChaosDot",
		"ChillEffect", "ShockEffect",
		"ImpaleChance", "ImpaleDPS",
	},
	defense = {
		"Armour", "Evasion", "EvadeChance",
		"EnergyShield", "Ward",
		"BlockChance", "SpellBlockChance", "SpellSuppressionChance",
		"DamageReductionMax", "PhysicalDamageReduction",
		"StunAvoidChance", "MovementSpeedMod", "EffectiveMovementSpeedMod",
	},
	resistances = {
		"FireResist", "ColdResist", "LightningResist", "ChaosResist",
		"FireResistOverCap", "ColdResistOverCap",
		"LightningResistOverCap", "ChaosResistOverCap",
		"CritExtraDamageReduction",
	},
	ehp = {
		"Life", "LifeUnreserved", "LifeUnreservedPercent", "Mana",
		"EnergyShield", "TotalEHP",
		"PhysicalMaximumHitTaken", "FireMaximumHitTaken",
		"ColdMaximumHitTaken", "LightningMaximumHitTaken",
		"ChaosMaximumHitTaken", "LifeRecoverable",
	},
	recovery = {
		"LifeRegenRecovery", "LifeLeechRate", "MaxLifeLeechRate",
		"LifeOnHit", "LifeOnKill",
		"EnergyShieldRegenRecovery", "EnergyShieldRecharge",
		"EnergyShieldLeechRate",
		"ManaRegenRecovery", "ManaLeechRate",
		"NetLifeRegen", "TotalNetRegen",
	},
	charges = {
		"PowerCharges", "PowerChargesMax",
		"FrenzyCharges", "FrenzyChargesMax",
		"EnduranceCharges", "EnduranceChargesMax",
		"Rage", "MaximumRage",
		"FortificationStacks", "TotalCharges", "GhostShrouds",
	},
	limits = {
		"ActiveTotemLimit", "ActiveTrapLimit", "ActiveMineLimit",
		"ActiveMinionLimit", "ActiveBrandLimit",
		"FlaskEffect", "FlaskChargeGen",
		"EnemyCurseLimit", "StoredUses", "SealMax",
	},
}

-- Build lookup sets for fast curated-key membership checks.
local curatedKeySets = {}
for sid, keys in pairs(sectionCuratedKeys) do
	local set = {}
	for _, k in ipairs(keys) do
		set[k] = true
	end
	curatedKeySets[sid] = set
end

-- Section definitions (stat sections only; structured sections added separately).
local statSectionDefs = {
	{ id = "offense",      name = "Offense",      description = "Hit damage, DPS, crit, speed, accuracy, projectiles, AoE, impale, durations, cooldowns" },
	{ id = "ailments",     name = "Ailments",      description = "Bleed, poison, ignite, decay, burning ground, DoT DPS, chill, freeze, shock effects" },
	{ id = "defense",      name = "Defense",       description = "Armour, evasion, ES, ward, block, dodge, suppression, stun, avoidance, immunities, movement speed" },
	{ id = "resistances",  name = "Resistances",   description = "Elemental and chaos resistances, overcap, damage reduction by type" },
	{ id = "ehp",          name = "Effective HP",   description = "Maximum hit taken, life and ES pools, Mind over Matter, guard, aegis, energy shield bypass" },
	{ id = "recovery",     name = "Recovery",       description = "Life/mana/ES regeneration, leech rates, recharge, recoup, net recovery vs degeneration" },
	{ id = "charges",      name = "Charges",        description = "Power, frenzy, endurance charges, fortification, rage, elusive, special charges" },
	{ id = "limits",       name = "Limits",         description = "Totem, trap, mine, minion, brand limits, flask generation, tinctures, gem levels, stored uses" },
}

-- Full section index including structured data sections.
local structuredSectionDefs = {
	{ id = "socket_groups", name = "Socket Groups",  description = "Skill gems, links, and socket group configuration" },
	{ id = "items",         name = "Items",           description = "Equipped gear by slot" },
	{ id = "keystones",        name = "Keystones",         description = "Allocated keystone passives" },
	{ id = "tree",             name = "Passive Tree",      description = "Allocated/available/remaining passive points, ascendancy nodes, tree version" },
}

-- Explicit section assignments for bare or ambiguous stat keys.
-- Checked first (exact match) before pattern rules.
local explicitSections = {
	-- Resource pools
	Life = "ehp",
	Mana = "ehp",
	EnergyShield = "defense",
	Armour = "defense",
	Evasion = "defense",
	Ward = "defense",
	LowestOfArmourAndEvasion = "defense",
	-- Attributes
	Str = "offense",
	Dex = "offense",
	Int = "offense",
	TotalAttr = "offense",
	LowestAttribute = "offense",
	-- EHP-specific
	LowestOfMaximumLifeAndMaximumMana = "ehp",
	ChaosInoculation = "ehp",
	LowLifePercentage = "ehp",
	FullLifePercentage = "ehp",
	LifeRecoverable = "ehp",
	CappingLife = "ehp",
	CappingES = "ehp",
	PvPTotalTakenHit = "ehp",
	-- Charges-specific
	Devotion = "charges",
	TotalCharges = "charges",
	GhostShrouds = "charges",
	-- Resistances-specific
	CritExtraDamageReduction = "resistances",
	-- Defense-specific
	DamageReductionMax = "defense",
	MovementSpeedMod = "defense",
	EffectiveMovementSpeedMod = "defense",
	AnyTakenReflect = "defense",
	-- Limits-specific
	HexDoomLimit = "limits",
	StoredUses = "limits",
	SealMax = "limits",
	EnemyCurseLimit = "limits",
	-- Flask/loot → limits
	FlaskEffect = "limits",
	FlaskChargeGen = "limits",
	LifeFlaskChargeGen = "limits",
	ManaFlaskChargeGen = "limits",
	UtilityFlaskChargeGen = "limits",
	FlaskChargeOnCritChance = "limits",
	LifeFlaskRecovery = "limits",
	LifeFlaskCharges = "limits",
	LootQuantityNormalEnemies = "offense",
	LootRarityMagicEnemies = "offense",
	QuantityMultiplier = "offense",
	-- Offense-specific
	CombinedDPS = "offense",
	TotalDPS = "offense",
	CullingDPS = "offense",
	ReservationDPS = "offense",
	ReservationDpsMultiplier = "offense",
	DisplayDamage = "offense",
	ActionSpeedMod = "offense",
	PreciseTechnique = "offense",
	-- Ailments-specific
	HasBonechill = "ailments",
}

-- Substring → section rules, checked in order. First match wins.
-- More specific patterns must come before broader ones.
local substringRules = {
	-- Defense: avoidance and immunities (before ailment element checks)
	{ "Avoid",     "defense" },
	{ "Immune",    "defense" },
	{ "Immunity",  "defense" },
	-- Resistances
	{ "Resist",    "resistances" },
	-- EHP
	{ "HitPool",          "ehp" },
	{ "MaximumHitTaken",  "ehp" },
	{ "Bypass",           "ehp" },
	{ "Guard",            "ehp" },
	{ "Aegis",            "ehp" },
	{ "MindOverMatter",   "ehp" },
	{ "SecondMinimal",    "ehp" },
	{ "ehpSection",       "ehp" },
	{ "OnlyShared",       "ehp" },
	{ "AnySpecific",      "ehp" },
	{ "LifeLoss",         "ehp" },
	-- Recovery (before defense to catch EnergyShieldRecharge etc.)
	{ "Regen",         "recovery" },
	{ "Recharge",      "recovery" },
	{ "Recoup",        "recovery" },
	{ "Leech",         "recovery" },
	{ "RecoveryRate",  "recovery" },
	{ "LifeOn",        "recovery" },
	{ "ManaOn",        "recovery" },
	{ "EnergyShieldOn","recovery" },
	{ "Degen",         "recovery" },
	{ "NetLife",       "recovery" },
	{ "NetMana",       "recovery" },
	{ "NetEnergy",     "recovery" },
	{ "ComprehensiveNet", "recovery" },
	{ "TotalNetRegen", "recovery" },
	-- Ailments (element-specific damage effects)
	{ "Bleed",            "ailments" },
	{ "Poison",           "ailments" },
	{ "Ignite",           "ailments" },
	{ "Decay",            "ailments" },
	{ "BurningGround",    "ailments" },
	{ "CausticGround",    "ailments" },
	{ "CorruptingBlood",  "ailments" },
	{ "TotalDot",         "ailments" },
	{ "showTotalDot",     "ailments" },
	{ "WithBleed",        "ailments" },
	{ "WithPoison",       "ailments" },
	{ "WithIgnite",       "ailments" },
	{ "WithDot",          "ailments" },
	{ "WithImpale",       "ailments" },
	{ "Chill",            "ailments" },
	{ "Freeze",           "ailments" },
	{ "Shock",            "ailments" },
	{ "Scorch",           "ailments" },
	{ "Brittle",          "ailments" },
	{ "Sap",              "ailments" },
	-- Charges
	{ "Charge",       "charges" },
	{ "Fortif",       "charges" },
	{ "Rage",         "charges" },
	{ "Elusive",      "charges" },
	{ "CrabBarrier",  "charges" },
	{ "Siphoning",    "charges" },
	{ "Challenger",   "charges" },
	{ "Blitz",        "charges" },
	{ "Inspiration",  "charges" },
	{ "Absorption",   "charges" },
	{ "Affliction",   "charges" },
	{ "Brutal",       "charges" },
	{ "Blood",        "charges" },
	{ "Spirit",       "charges" },
	-- Limits
	{ "ActiveTotem",        "limits" },
	{ "ActiveTrap",         "limits" },
	{ "ActiveMine",         "limits" },
	{ "ActiveBrand",        "limits" },
	{ "ActiveMinion",       "limits" },
	{ "ActivePhantasm",     "limits" },
	{ "Summoned",           "limits" },
	{ "ThrowCount",         "limits" },
	{ "Tincture",           "limits" },
	{ "BrandAttachment",    "limits" },
	{ "Corpse",             "limits" },
	{ "GemLevel",           "limits" },
	{ "GemQuality",         "limits" },
	{ "GemHas",             "limits" },
	-- Defense (broad patterns)
	{ "Block",              "defense" },
	{ "Evade",              "defense" },
	{ "Evasion",            "defense" },
	{ "Suppress",           "defense" },
	{ "Dodge",              "defense" },
	{ "Stun",               "defense" },
	{ "NotHitChance",       "defense" },
	{ "LightRadius",        "defense" },
	{ "DamageReduction",    "defense" },
	{ "ArmourDefense",      "defense" },
	{ "Blind",              "defense" },
	{ "Silence",            "defense" },
	{ "Maim",               "defense" },
	{ "Hinder",             "defense" },
	{ "Knockback",          "defense" },
	{ "DebuffExpiration",   "defense" },
	{ "SelfBlink",          "defense" },
	{ "SelfBlind",          "defense" },
	{ "Exposure",           "defense" },
	{ "Wither",             "defense" },
	{ "Curse",              "defense" },
	{ "MovementSpeed",      "defense" },
	{ "TotemLife",           "defense" },
	{ "TotemArmour",        "defense" },
	{ "TotemBlockChance",   "defense" },
	{ "TotemEnergyShield",  "defense" },
}

-- Classify a stat key into a section ID.
local function classifyStat(key)
	-- 1. Explicit table (exact match)
	local section = explicitSections[key]
	if section then return section end

	-- 2. Special pattern: Base<Type>DamageReduction → resistances
	if key:match("^Base%a+DamageReduction") then return "resistances" end

	-- 3. Substring rules (first match wins)
	for _, rule in ipairs(substringRules) do
		if key:find(rule[1], 1, true) then
			return rule[2]
		end
	end

	-- 4. Catch-all
	return "offense"
end

-- Serialize calc output into grouped sections.
-- requestedStatKeys: optional set (table of key→true) of extra stat keys
-- the caller wants included alongside curated defaults.
local function serializeSections(build, requestedStatKeys)
	local emptySummary = {}
	for _, key in ipairs(summaryKeys) do
		emptySummary[key] = 0
	end

	if not build.calcsTab or not build.calcsTab.mainOutput then
		return {
			summary = emptySummary,
			section_index = {},
			sections = {},
		}
	end

	local output = build.calcsTab.mainOutput

	-- Initialize raw stat section buckets (full classification)
	local rawSections = {}
	for _, def in ipairs(statSectionDefs) do
		rawSections[def.id] = {}
	end

	-- Build summary from fixed keys
	local summary = {}
	for _, key in ipairs(summaryKeys) do
		summary[key] = output[key] or 0
	end

	-- Strip zero-value per-element damage keys from the summary so only
	-- relevant damage types appear (e.g. a pure-fire build shows only
	-- FireHitAverage, not five zero entries for the other elements).
	for _, key in ipairs(summaryPerElementKeys) do
		if summary[key] == 0 then
			summary[key] = nil
		end
	end

	-- Classify all scalar stats into sections
	for key, value in pairs(output) do
		local t = type(value)
		if t == "number" or t == "string" or t == "boolean" then
			local sid = classifyStat(key)
			if rawSections[sid] then
				rawSections[sid][key] = value
			else
				-- Unknown section from classifyStat; put in offense
				rawSections.offense[key] = value
			end
		end
	end

	-- Apply curated filtering: keep curated keys + requested keys,
	-- collect remaining non-zero keys into _extra_keys.
	local sections = {}
	for _, def in ipairs(statSectionDefs) do
		local sid = def.id
		local raw = rawSections[sid]
		local curated = curatedKeySets[sid]
		local filtered = {}
		local extras = {}

		for key, value in pairs(raw) do
			-- Skip zero/false values entirely
			local dominated = (type(value) == "number" and value == 0)
				or (type(value) == "boolean" and not value)
			if not dominated then
				if (curated and curated[key])
					or (requestedStatKeys and requestedStatKeys[key]) then
					filtered[key] = value
				else
					extras[#extras + 1] = key
				end
			end
		end

		table.sort(extras)
		if #extras > 0 then
			filtered._extra_keys = extras
		end
		sections[sid] = filtered
	end

	-- Add structured data as sections
	sections.socket_groups = serializeSocketGroups(build)
	sections.items = serializeItems(build)
	sections.keystones = serializeKeystones(build)
	sections.tree = serializeTreeSummary(build)

	-- Build section index
	local index = {}
	for _, def in ipairs(statSectionDefs) do
		index[#index + 1] = { id = def.id, name = def.name, description = def.description }
	end
	for _, def in ipairs(structuredSectionDefs) do
		index[#index + 1] = { id = def.id, name = def.name, description = def.description }
	end

	-- Minion sections (conditional — only when build has minions)
	if output.Minion and type(output.Minion) == "table" then
		local minionOffense = {}
		local minionDefense = {}
		for key, value in pairs(output.Minion) do
			local t = type(value)
			if t == "number" or t == "string" or t == "boolean" then
				local sid = classifyStat(key)
				-- Group minion stats into just two buckets
				if sid == "defense" or sid == "resistances" or sid == "recovery" or sid == "ehp" then
					minionDefense[key] = value
				else
					minionOffense[key] = value
				end
			end
		end
		sections.minion_offense = minionOffense
		sections.minion_defense = minionDefense
		index[#index + 1] = { id = "minion_offense", name = "Minion Offense", description = "Minion damage, DPS, crit, speed, accuracy, ailments" }
		index[#index + 1] = { id = "minion_defense", name = "Minion Defense", description = "Minion armour, evasion, ES, resistances, recovery, block" }
	end

	return {
		summary = summary,
		section_index = index,
		sections = sections,
	}
end

-- Parse optional stat_keys from request into a set for serializeSections.
local function parseStatKeys(request)
	if not request.statKeys then return nil end
	local set = {}
	for _, k in ipairs(request.statKeys) do
		set[k] = true
	end
	return set
end

-- Process a calc request
local function handleCalc(request)
	local xml = request.xml
	if not xml or xml == "" then
		return { type = "error", message = "missing 'xml' field" }
	end

	-- Load the build from XML
	local calcOk, calcErr = pcall(function()
		loadBuildFromXML(xml, "api-build")
	end)
	if not calcOk then
		return { type = "error", message = "failed to load build: " .. tostring(calcErr) }
	end

	-- Note: `build` is a global set by HeadlessWrapper after loadBuildFromXML
	-- calls SetMode("BUILD"), so it should already point to the current build.

	-- Force a full recalculation
	build.buildFlag = true
	runCallback("OnFrame")

	-- Serialize results into grouped sections
	local statKeys = parseStatKeys(request)
	local grouped = serializeSections(build, statKeys)

	injectConfigSection(grouped, build)

	local result = {
		type = "result",
		data = {
			character = serializeCharacter(build),
			summary = grouped.summary,
			section_index = grouped.section_index,
			sections = grouped.sections,
		}
	}

	return result
end

-- ---------------------------------------------------------------------------
-- Name → object indexes (built lazily, cached for process lifetime)
-- ---------------------------------------------------------------------------

local gemIndex     -- name (lower) → gem data from build.data.gems
local uniqueIndex  -- name (lower) → { raw = raw_text, type = item_type }
local nodeIndex    -- name (lower) → tree node

local function ensureGemIndex()
	if gemIndex then return end
	gemIndex = {}
	if not build or not build.data or not build.data.gems then return end
	for id, gem in pairs(build.data.gems) do
		if gem.name then
			gemIndex[gem.name:lower()] = gem
		end
	end
	local count = 0
	for _ in pairs(gemIndex) do count = count + 1 end
	log("Built gem index: %d entries", count)
end

local function ensureUniqueIndex()
	if uniqueIndex then return end
	uniqueIndex = {}
	if not build or not build.data or not build.data.uniques then return end
	for itemType, list in pairs(build.data.uniques) do
		for _, raw in ipairs(list) do
			-- Extract name from first line of the raw text
			local name = raw:match("^(.-)\n")
			if name then
				uniqueIndex[name:lower()] = { raw = raw, type = itemType }
			end
		end
	end
	local count = 0
	for _ in pairs(uniqueIndex) do count = count + 1 end
	log("Built unique index: %d entries", count)
end

local function ensureNodeIndex()
	if nodeIndex then return end
	nodeIndex = {}
	if not build or not build.spec or not build.spec.nodes then return end
	for id, node in pairs(build.spec.nodes) do
		local name = node.dn or node.name
		if name and (node.isKeystone or node.isNotable) then
			nodeIndex[name:lower()] = node
		end
	end
	local count = 0
	for _ in pairs(nodeIndex) do count = count + 1 end
	log("Built node index: %d entries (keystones + notables)", count)
end

-- ---------------------------------------------------------------------------
-- Modify operation handlers
-- ---------------------------------------------------------------------------

-- Collects path details from allocate_node operations within a single
-- handleModify call. Reset before the operation loop, read after.
local allocationLog = {}

local function applySetLevel(op)
	if not op.level then return "set_level: missing 'level'" end
	build.characterLevel = op.level
	return nil
end

local function applyToggleKeystone(op)
	if not op.name then return "toggle_keystone: missing 'name'" end
	ensureNodeIndex()
	local node = nodeIndex[op.name:lower()]
	if not node then return "toggle_keystone: keystone not found: " .. op.name end
	if op.enabled == false then
		build.spec:DeallocNode(node)
	else
		build.spec:AllocNode(node)
	end
	return nil
end

local function applyAllocateNode(op)
	if not op.name then return "allocate_node: missing 'name'" end
	ensureNodeIndex()
	local node = nodeIndex[op.name:lower()]
	if not node then return "allocate_node: node not found: " .. op.name end
	if not node.path then return "allocate_node: no path to node (unreachable from current tree): " .. op.name end

	-- Capture the path before AllocNode (it rebuilds paths after allocation)
	local pathNodes = {}
	for _, pathNode in ipairs(node.path) do
		if not pathNode.alloc then
			pathNodes[#pathNodes + 1] = {
				name = pathNode.dn or pathNode.name or tostring(pathNode.id),
				type = pathNode.isKeystone and "keystone"
					or pathNode.isNotable and "notable"
					or "travel",
			}
		end
	end

	build.spec:AllocNode(node)

	allocationLog[#allocationLog + 1] = {
		target = node.dn or node.name,
		points_spent = #pathNodes,
		path = pathNodes,
	}
	return nil
end

local function applyDeallocateNode(op)
	if not op.name then return "deallocate_node: missing 'name'" end
	ensureNodeIndex()
	local node = nodeIndex[op.name:lower()]
	if not node then return "deallocate_node: node not found: " .. op.name end
	if not node.alloc then return "deallocate_node: node is not allocated: " .. op.name end
	build.spec:DeallocNode(node)
	return nil
end

local function applySwapGem(op)
	if not op.new_gem then return "swap_gem: missing 'new_gem'" end
	ensureGemIndex()
	local gemData = gemIndex[op.new_gem:lower()]
	if not gemData then return "swap_gem: gem not found: " .. op.new_gem end

	local groupIdx = (op.socket_group or 0) + 1 -- Lua is 1-indexed
	local gemIdx = (op.gem_index or 0) + 1
	local groups = build.skillsTab.socketGroupList
	if not groups[groupIdx] then return "swap_gem: socket group not found" end
	local group = groups[groupIdx]
	if not group.gemList[gemIdx] then return "swap_gem: gem index out of range" end

	group.gemList[gemIdx] = {
		nameSpec = gemData.name,
		level = op.level or 20,
		quality = op.quality or 20,
		qualityId = op.quality_id or "Default",
		enabled = true,
		gemId = gemData.id,
		skillId = gemData.grantedEffectId,
	}
	build.skillsTab:ProcessSocketGroup(group)
	return nil
end

local function applyAddGem(op)
	if not op.gem then return "add_gem: missing 'gem'" end
	ensureGemIndex()
	local gemData = gemIndex[op.gem:lower()]
	if not gemData then return "add_gem: gem not found: " .. op.gem end

	local groupIdx = (op.socket_group or 0) + 1
	local groups = build.skillsTab.socketGroupList
	if not groups[groupIdx] then return "add_gem: socket group not found" end
	local group = groups[groupIdx]

	group.gemList[#group.gemList + 1] = {
		nameSpec = gemData.name,
		level = op.level or 20,
		quality = op.quality or 20,
		qualityId = op.quality_id or "Default",
		enabled = true,
		gemId = gemData.id,
		skillId = gemData.grantedEffectId,
	}
	build.skillsTab:ProcessSocketGroup(group)
	return nil
end

local function applyRemoveGem(op)
	local groupIdx = (op.socket_group or 0) + 1
	local gemIdx = (op.gem_index or 0) + 1
	local groups = build.skillsTab.socketGroupList
	if not groups[groupIdx] then return "remove_gem: socket group not found" end
	local group = groups[groupIdx]
	if not group.gemList[gemIdx] then return "remove_gem: gem index out of range" end

	table.remove(group.gemList, gemIdx)
	build.skillsTab:ProcessSocketGroup(group)
	return nil
end

local function applyEquipUnique(op)
	if not op.name then return "equip_unique: missing 'name'" end
	if not op.slot then return "equip_unique: missing 'slot'" end
	if op.slot:match("^Flask %d$") then
		return "equip_unique: use equip_flask for Flask slots"
	end
	ensureUniqueIndex()
	local entry = uniqueIndex[op.name:lower()]
	if not entry then return "equip_unique: unique not found: " .. op.name end

	local item = new("Item", entry.raw)
	build.itemsTab:AddItem(item, true) -- noAutoEquip

	-- Find the target slot and equip
	local activeSet = build.itemsTab.activeItemSet
	local itemSet = build.itemsTab.itemSets[activeSet]
	if itemSet and itemSet[op.slot] then
		itemSet[op.slot].selItemId = item.id
	else
		-- Try direct slot access
		for _, slot in ipairs(build.itemsTab.orderedSlots) do
			if slot.slotName == op.slot then
				slot.selItemId = item.id
				break
			end
		end
	end
	return nil
end

local function applyEquipFlask(op)
	if not op.name then return "equip_flask: missing 'name'" end
	if not op.slot then return "equip_flask: missing 'slot'" end
	if not op.slot:match("^Flask %d$") then
		return "equip_flask: slot must be Flask 1-5, got: " .. op.slot
	end
	ensureUniqueIndex()
	local entry = uniqueIndex[op.name:lower()]
	if not entry then return "equip_flask: unique not found: " .. op.name end

	local item = new("Item", entry.raw)
	build.itemsTab:AddItem(item, true) -- noAutoEquip

	-- Equip to slot and activate
	local activeSet = build.itemsTab.activeItemSet
	local itemSet = build.itemsTab.itemSets[activeSet]
	if itemSet and itemSet[op.slot] then
		itemSet[op.slot].selItemId = item.id
		itemSet[op.slot].active = true
	end
	for _, slot in ipairs(build.itemsTab.orderedSlots) do
		if slot.slotName == op.slot then
			slot.selItemId = item.id
			slot.active = true
			if slot.controls and slot.controls.activate then
				slot.controls.activate.state = true
			end
			break
		end
	end
	return nil
end

local function applySetItem(op)
	if not op.text then return "set_item: missing 'text'" end
	if not op.slot then return "set_item: missing 'slot'" end

	local item = new("Item", op.text)
	build.itemsTab:AddItem(item, true)

	local activeSet = build.itemsTab.activeItemSet
	local itemSet = build.itemsTab.itemSets[activeSet]
	if itemSet and itemSet[op.slot] then
		itemSet[op.slot].selItemId = item.id
	else
		for _, slot in ipairs(build.itemsTab.orderedSlots) do
			if slot.slotName == op.slot then
				slot.selItemId = item.id
				break
			end
		end
	end
	return nil
end

local function applySetConfig(op)
	if not op.var then return "set_config: missing 'var'" end
	if op.value == nil then return "set_config: missing 'value'" end
	if not build.configTab then return "set_config: configTab not available" end
	-- Don't allow setting character keys via set_config — use set_bandit/set_pantheon
	if configCharacterKeys[op.var] then
		return "set_config: use set_bandit or set_pantheon for " .. op.var
	end
	build.configTab.input[op.var] = op.value
	build.configTab:BuildModList()
	return nil
end

local validBandits = { None = true, Oak = true, Kraityn = true, Alira = true }

local function applySetBandit(op)
	if not op.bandit then return "set_bandit: missing 'bandit'" end
	if not validBandits[op.bandit] then
		return "set_bandit: invalid value '" .. op.bandit .. "'. Valid: None, Oak, Kraityn, Alira"
	end
	if not build.configTab then return "set_bandit: configTab not available" end
	build.bandit = op.bandit
	build.configTab.input.bandit = op.bandit
	build.configTab:BuildModList()
	return nil
end

local validMajorGods = { None = true, TheBrineKing = true, Lunaris = true, Solaris = true, Arakaali = true }
local validMinorGods = {
	None = true, Gruthkul = true, Yugul = true, Abberath = true, Tukohama = true,
	Garukhan = true, Ralakesh = true, Ryslatha = true, Shakari = true,
}

local function applySetPantheon(op)
	if not op.major and not op.minor then
		return "set_pantheon: at least one of 'major' or 'minor' is required"
	end
	if not build.configTab then return "set_pantheon: configTab not available" end
	if op.major then
		if not validMajorGods[op.major] then
			return "set_pantheon: invalid major god '" .. op.major .. "'"
		end
		build.pantheonMajorGod = op.major
		build.configTab.input.pantheonMajorGod = op.major
	end
	if op.minor then
		if not validMinorGods[op.minor] then
			return "set_pantheon: invalid minor god '" .. op.minor .. "'"
		end
		build.pantheonMinorGod = op.minor
		build.configTab.input.pantheonMinorGod = op.minor
	end
	build.configTab:BuildModList()
	return nil
end

-- Dispatch table for operations
local opHandlers = {
	set_level        = applySetLevel,
	toggle_keystone  = applyToggleKeystone,
	allocate_node    = applyAllocateNode,
	deallocate_node  = applyDeallocateNode,
	swap_gem         = applySwapGem,
	add_gem          = applyAddGem,
	remove_gem       = applyRemoveGem,
	equip_unique     = applyEquipUnique,
	equip_flask      = applyEquipFlask,
	set_item         = applySetItem,
	set_config       = applySetConfig,
	set_bandit       = applySetBandit,
	set_pantheon     = applySetPantheon,
}

-- Process a modify request
local function handleModify(request)
	local xml = request.xml
	if not xml or xml == "" then
		return { type = "error", message = "missing 'xml' field" }
	end
	local ops = request.operations
	if not ops or #ops == 0 then
		return { type = "error", message = "missing 'operations' field" }
	end

	-- Load the build from XML
	local loadOk, loadErr = pcall(function()
		loadBuildFromXML(xml, "modify-build")
	end)
	if not loadOk then
		return { type = "error", message = "failed to load build: " .. tostring(loadErr) }
	end

	-- Use pre-computed summary from Go (avoids a redundant PoB calc pass).
	-- Falls back to a live calc only if the Go handler couldn't provide one.
	local preSummary = request.preSummary
	if not preSummary then
		build.buildFlag = true
		runCallback("OnFrame")
		preSummary = {}
		if build.calcsTab and build.calcsTab.mainOutput then
			for _, key in ipairs(summaryKeys) do
				preSummary[key] = build.calcsTab.mainOutput[key] or 0
			end
		end
	end

	-- Invalidate cached indexes (new build may have different tree/data)
	nodeIndex = nil
	allocationLog = {}

	-- Apply each operation in order
	for i, op in ipairs(ops) do
		if not op.op then
			return { type = "error", message = "operation " .. i .. ": missing 'op' field" }
		end
		local handler = opHandlers[op.op]
		if not handler then
			return { type = "error", message = "operation " .. i .. ": unknown op: " .. op.op }
		end
		local errMsg = handler(op)
		if errMsg then
			return { type = "error", message = "operation " .. i .. ": " .. errMsg }
		end
	end

	-- Recalculate
	build.buildFlag = true
	runCallback("OnFrame")

	-- Export the modified build to XML
	local modifiedXml = build:SaveDB("modified")

	-- Serialize results into grouped sections
	local statKeys = parseStatKeys(request)
	local grouped = serializeSections(build, statKeys)

	-- Compute delta: compare pre-modify vs post-modify summary
	local changes = {}
	local hasChanges = false
	for _, key in ipairs(summaryKeys) do
		local before = preSummary[key] or 0
		local after = grouped.summary[key] or 0
		if type(before) == "number" and type(after) == "number" then
			local delta = after - before
			if delta ~= 0 then
				changes[key] = { before = before, after = after, delta = delta }
				hasChanges = true
			end
		elseif before ~= after then
			changes[key] = { before = before, after = after }
			hasChanges = true
		end
	end

	-- Include allocation log if any allocate_node operations ran
	if #allocationLog > 0 then
		grouped.sections.allocation_log = allocationLog
		grouped.section_index[#grouped.section_index + 1] = {
			id = "allocation_log",
			name = "Allocation Log",
			description = "Nodes allocated along the path for each allocate_node operation, with points spent",
		}
	end

	injectConfigSection(grouped, build)

	local resultData = {
		character = serializeCharacter(build),
		summary = grouped.summary,
		section_index = grouped.section_index,
		sections = grouped.sections,
	}
	if hasChanges then
		resultData.changes = changes
	end

	return {
		type = "result",
		data = resultData,
		xml = modifiedXml,
	}
end

-- Process a nearby node search request
local function handleNearby(request)
	local xml = request.xml
	if not xml or xml == "" then
		return { type = "error", message = "missing 'xml' field" }
	end

	local metrics = request.metrics
	if not metrics or #metrics == 0 then
		return { type = "error", message = "missing 'metrics' field" }
	end

	local radius = request.radius or 5
	local limit = request.limit or 10
	local deltaStats = request.deltaStats or { "Life", "CombinedDPS", "EnergyShield" }
	local sortOrder = request.sort or "desc" -- "desc" = highest first (beneficial), "asc" = lowest first

	-- Load the build from XML
	local loadOk, loadErr = pcall(function()
		loadBuildFromXML(xml, "nearby-build")
	end)
	if not loadOk then
		return { type = "error", message = "failed to load build: " .. tostring(loadErr) }
	end

	-- Force a full recalculation so calcsTab is populated
	build.buildFlag = true
	runCallback("OnFrame")

	-- Get the calculator function and baseline output
	local calcFunc, calcBase = build.calcsTab:GetMiscCalculator()

	-- Collect all stats we need deltas for (metrics + deltaStats, deduplicated)
	local allStats = {}
	local statSet = {}
	for _, s in ipairs(metrics) do
		if not statSet[s] then
			allStats[#allStats + 1] = s
			statSet[s] = true
		end
	end
	for _, s in ipairs(deltaStats) do
		if not statSet[s] then
			allStats[#allStats + 1] = s
			statSet[s] = true
		end
	end

	-- Evaluate all candidate nodes within radius
	local cache = {}
	local candidates = {}
	for id, node in pairs(build.spec.nodes) do
		if not node.alloc
			and node.pathDist and node.pathDist <= radius
			and node.path
			and (node.type == "Normal" or node.type == "Notable" or node.type == "Keystone")
			and node.modKey and node.modKey ~= ""
			and not node.ascendancyName
		then
			-- Compute output with this node hypothetically allocated (modKey cache)
			if not cache[node.modKey] then
				cache[node.modKey] = calcFunc({ addNodes = { [node] = true } })
			end
			local output = cache[node.modKey]

			-- Compute deltas for all requested stats
			local deltas = {}
			for _, stat in ipairs(allStats) do
				local base = calcBase[stat] or 0
				local modified = output[stat] or 0
				deltas[stat] = modified - base
			end

			-- Build path names
			local pathNames = {}
			for _, pathNode in ipairs(node.path) do
				pathNames[#pathNames + 1] = pathNode.dn or pathNode.name or tostring(pathNode.id)
			end

			-- Build stat descriptions
			local stats = {}
			local sd = node.sd or node.stats
			if sd then
				for _, s in ipairs(sd) do
					stats[#stats + 1] = s
				end
			end

			-- Determine node type string
			local nodeType = "normal"
			if node.isKeystone then
				nodeType = "keystone"
			elseif node.isNotable then
				nodeType = "notable"
			end

			candidates[#candidates + 1] = {
				name = node.dn or node.name or ("node_" .. tostring(id)),
				type = nodeType,
				stats = stats,
				path_cost = node.pathDist,
				path = pathNames,
				deltas = deltas,
				-- efficiency computed per-metric below
			}
		end
	end

	-- Build result sets: one per metric, ranked by efficiency
	local ascending = sortOrder == "asc"
	local results = {}
	for _, metric in ipairs(metrics) do
		-- Compute signed efficiency for this metric and sort
		local ranked = {}
		for _, c in ipairs(candidates) do
			local delta = c.deltas[metric] or 0
			local eff = 0
			if c.path_cost > 0 then
				eff = delta / c.path_cost
			end
			ranked[#ranked + 1] = {
				name = c.name,
				type = c.type,
				stats = c.stats,
				path_cost = c.path_cost,
				path = c.path,
				deltas = c.deltas,
				efficiency = eff,
			}
		end

		if ascending then
			table.sort(ranked, function(a, b)
				if a.efficiency ~= b.efficiency then return a.efficiency < b.efficiency end
				if a.path_cost ~= b.path_cost then return a.path_cost < b.path_cost end
				return a.name < b.name
			end)
		else
			table.sort(ranked, function(a, b)
				if a.efficiency ~= b.efficiency then return a.efficiency > b.efficiency end
				if a.path_cost ~= b.path_cost then return a.path_cost < b.path_cost end
				return a.name < b.name
			end)
		end

		-- Take top N
		local nodes = {}
		for i = 1, math.min(limit, #ranked) do
			nodes[i] = ranked[i]
		end

		results[#results + 1] = {
			metric = metric,
			baseline = calcBase[metric] or 0,
			limit = limit,
			radius = radius,
			nodes = nodes,
		}
	end

	return { type = "result", data = results }
end

-- Main request loop
log("Ready for requests")

for line in io.stdin:lines() do
	-- Parse the request
	local request, pos, err = dkjson.decode(line)
	if not request then
		local resp = dkjson.encode({ type = "error", message = "invalid JSON: " .. tostring(err) })
		io.stdout:write(resp .. "\n")
		io.stdout:flush()
	else
		local response
		if request.type == "calc" then
			local ok, result = pcall(handleCalc, request)
			if ok then
				response = result
			else
				response = { type = "error", message = "calc crashed: " .. tostring(result) }
			end
		elseif request.type == "modify" then
			local ok, result = pcall(handleModify, request)
			if ok then
				response = result
			else
				response = { type = "error", message = "modify crashed: " .. tostring(result) }
			end
		elseif request.type == "nearby" then
			local ok, result = pcall(handleNearby, request)
			if ok then
				response = result
			else
				response = { type = "error", message = "nearby crashed: " .. tostring(result) }
			end
		elseif request.type == "ping" then
			response = { type = "pong" }
		else
			response = { type = "error", message = "unknown request type: " .. tostring(request.type) }
		end

		local encoded = dkjson.encode(response)
		io.stdout:write(encoded .. "\n")
		io.stdout:flush()
	end
end

log("stdin closed, exiting")
