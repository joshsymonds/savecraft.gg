-- views/scripts/extract-tree-data.lua
--
-- Extracts node coordinates + connections from PoB's bundled tree.lua
-- and emits JSON for the Storybook tree-overlay prototype.
--
-- The coordinate math is a direct port of PoB's PassiveTree.lua:
--   node.angle = orbitAnglesByOrbit[orbit + 1][orbitIndex + 1]   (radians)
--   orbitRadius = orbitRadii[orbit + 1]
--   node.x = group.x + sin(angle) * orbitRadius
--   node.y = group.y - cos(angle) * orbitRadius
--
-- Same constants (skillsPerOrbit, orbitRadii) and same orbitAngles
-- table for 16/40-node special orbits. Verified against
-- .reference/pob/src/Classes/PassiveTree.lua lines 829-832 and 971-992.
--
-- Usage:
--   luajit extract-tree-data.lua [tree-lua-path] > tree-data.gen.json
--
-- Default path: ../../.reference/pob/src/TreeData/3_28/tree.lua
-- relative to this script's directory.

local m_sin, m_cos, m_pi = math.sin, math.cos, math.pi

-- Mirror PoB's CalcOrbitAngles. Two special cases (16 + 40 nodes) use
-- the irregular-spacing tables documented in
-- https://github.com/grindinggear/skilltree-export/blob/3.17.0/README.md
local function calcOrbitAngles(nodesInOrbit)
	local angles = {}
	if nodesInOrbit == 16 then
		angles = {0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330}
	elseif nodesInOrbit == 40 then
		angles = {0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350}
	else
		for i = 0, nodesInOrbit do
			angles[i + 1] = 360 * i / nodesInOrbit
		end
	end
	for i, deg in ipairs(angles) do
		angles[i] = deg * m_pi / 180
	end
	return angles
end

-- Resolve paths relative to this script. arg[0] is the script path.
local function scriptDir()
	local path = arg[0] or ""
	-- Use posix-style separator; PoB checkout is unix-only via Nix devenv.
	local dir = path:match("(.*/)")
	return dir or "./"
end

local treePath = arg[1]
if not treePath or treePath == "" then
	treePath = scriptDir() .. "../../.reference/pob/src/TreeData/3_28/tree.lua"
end

-- PoB ships dkjson for serialization — same module wrapper.lua uses.
package.path = scriptDir() .. "../../.reference/pob/runtime/lua/?.lua;" .. package.path
local dkjson = require("dkjson")

-- Load the tree data. tree.lua is a single `return { ... }` literal.
local tree = dofile(treePath)
if not tree or not tree.constants or not tree.groups or not tree.nodes then
	io.stderr:write("error: tree.lua missing expected fields\n")
	os.exit(1)
end

local skillsPerOrbit = tree.constants.skillsPerOrbit
local orbitRadii = tree.constants.orbitRadii

-- Pre-compute angles per orbit so we don't recompute for every node.
local orbitAnglesByOrbit = {}
for orbit, nodesInOrbit in ipairs(skillsPerOrbit) do
	orbitAnglesByOrbit[orbit] = calcOrbitAngles(nodesInOrbit)
end

local outNodes = {}
local connections = {}
local seenConn = {}

local function classifyType(node)
	if node.isKeystone then return "Keystone" end
	if node.isNotable then return "Notable" end
	if node.isMastery then return "Mastery" end
	if node.isJewelSocket then return "JewelSocket" end
	if node.classStartIndex ~= nil then return "ClassStart" end
	return "Normal"
end

for id, node in pairs(tree.nodes) do
	if id ~= "root" and node.group then
		local group = tree.groups[node.group]
		if group then
			local orbitOneIdx = node.orbit + 1
			local angle = orbitAnglesByOrbit[orbitOneIdx][node.orbitIndex + 1]
			local radius = orbitRadii[orbitOneIdx]
			local x = group.x + m_sin(angle) * radius
			local y = group.y - m_cos(angle) * radius

			outNodes[tostring(id)] = {
				x = x,
				y = y,
				name = node.name or "",
				type = classifyType(node),
				ascendancy = node.ascendancyName or nil,
			}

			-- Deduplicate undirected pairs by lex-ordering endpoints.
			if node.out then
				for _, target in ipairs(node.out) do
					local a, b = tostring(id), tostring(target)
					local key
					if a < b then key = a .. "-" .. b else key = b .. "-" .. a end
					if not seenConn[key] then
						seenConn[key] = true
						table.insert(connections, {a, b})
					end
				end
			end
		end
	end
end

-- min_x/min_y/max_x/max_y are pre-computed by PoB at the top of
-- tree.lua. Pass them through so the renderer can size its viewBox
-- without scanning every node.
local out = {
	version = "3.28",
	bounds = {
		min_x = tree.min_x,
		min_y = tree.min_y,
		max_x = tree.max_x,
		max_y = tree.max_y,
	},
	skills_per_orbit = skillsPerOrbit,
	orbit_radii = orbitRadii,
	nodes = outNodes,
	connections = connections,
}

io.write(dkjson.encode(out))
io.write("\n")
