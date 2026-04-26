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

-- First pass: compute per-node positions + classify type. We need this
-- map fully populated before the connection pass so we can look up an
-- edge's other endpoint by id (for the same-group/same-orbit arc test
-- and the type filters that match PoB's BuildConnector rules).
--
-- Skip categories of nodes that show up as floating orphans in the
-- visualization without contributing to the regular tree:
--
--   - isBlighted: entries in the annoint database (Blight league
--     mechanic). They live in tree.nodes but with empty in/out
--     because they're a notable POOL for amulet annointing, not
--     positions on the tree map.
--   - isProxy: PoB-internal scaffolding nodes (e.g. "Position Proxy")
--     that exist for cluster-jewel internals. Never visible in PoB's
--     own UI either.
--   - Standalone-orphan: nodes with empty `in` AND empty `out` that
--     ALSO aren't masteries. Masteries legitimately have empty `out`
--     but non-empty `in` (their cluster's notables connect TO them).
--     Truly empty-both nodes are orphan ascendancy notables (Nine
--     Lives on Necromancer, Unleashed Potential on Ascendant, etc.)
--     that PoB renders via different mechanisms we don't replicate.
--   - expansionJewel: cluster-jewel scaffolding. Medium/Small Jewel
--     Sockets with an expansionJewel field are CHILD sockets that
--     only become reachable when a parent cluster jewel is socketed.
--     They sit at remote coordinates outside the regular tree and
--     confuse the visualization. Real cluster-jewel allocation
--     rendering is a separate concern (would need its own popout).
local function isOrphan(node)
	local hasIn = node["in"] and #node["in"] > 0
	local hasOut = node.out and #node.out > 0
	return not hasIn and not hasOut
end

local nodeMeta = {}  -- [id] = { x, y, type, group, orbit, angle, ascendancy, isProxy }
for id, node in pairs(tree.nodes) do
	if id ~= "root" and node.group
		and not node.isBlighted
		and not node.isProxy
		and not node.expansionJewel
		and not (isOrphan(node) and not node.isMastery)
	then
		local group = tree.groups[node.group]
		if group then
			local orbitOneIdx = node.orbit + 1
			local angle = orbitAnglesByOrbit[orbitOneIdx][node.orbitIndex + 1]
			local radius = orbitRadii[orbitOneIdx]
			local x = group.x + m_sin(angle) * radius
			local y = group.y - m_cos(angle) * radius
			local nodeType = classifyType(node)

			nodeMeta[tostring(id)] = {
				x = x,
				y = y,
				type = nodeType,
				group = node.group,
				groupX = group.x,
				groupY = group.y,
				orbit = node.orbit,
				orbitRadius = radius,
				angle = angle,
				ascendancy = node.ascendancyName or nil,
				isProxy = node.isProxy or group.isProxy or false,
			}

			outNodes[tostring(id)] = {
				x = x,
				y = y,
				name = node.name or "",
				type = nodeType,
				ascendancy = node.ascendancyName or nil,
			}
		end
	end
end

-- Second pass: emit connections. Filter rules:
--
--   - Mastery: skipped per PoB's BuildConnector rule. Masteries are
--     central cluster anchors with no rendered lines — surrounding
--     notables are reached through other paths.
--   - Cross-ascendancy: skipped (regular-tree node to ascendancy node).
--   - Proxy: skipped (cluster-jewel internals).
--
-- We DO emit ClassStart connections, even though PoB's BuildConnector
-- skips them. PoB hides them in the connector pipeline because the
-- class-start background sprite shows those spokes visually. We don't
-- ship the sprites; rendering ClassStart→tier1 as straight lines
-- preserves the visual continuity from the central spawn area outward.
--
-- For each surviving pair: if same group + same orbit, classify as
-- "arc" with pre-computed start/end angles + radius so the renderer
-- can emit an SVG path-arc rather than a chord. Otherwise straight line.
local function shouldEmitConnection(a, b)
	if not a or not b then return false end
	if a.type == "Mastery" or b.type == "Mastery" then return false end
	if a.ascendancy ~= b.ascendancy then return false end
	if a.isProxy or b.isProxy then return false end
	return true
end

local function classifyConnection(aId, bId, a, b)
	if a.group == b.group and a.orbit == b.orbit then
		-- Same orbit of same group → arc. Match PoB's "shorter way"
		-- normalization: swap endpoints if angle1 > angle2, then if
		-- arcAngle still ≥ π, go the other way.
		local angleA, angleB = a.angle, b.angle
		if angleA > angleB then
			angleA, angleB = angleB, angleA
			aId, bId = bId, aId
		end
		local arcAngle = angleB - angleA
		if arcAngle >= m_pi then
			-- Mirror back: take the short way around.
			angleA, angleB = angleB, angleA
			aId, bId = bId, aId
			arcAngle = m_pi * 2 - arcAngle
		end
		return {
			type = "arc",
			a = aId,
			b = bId,
			cx = a.groupX,
			cy = a.groupY,
			r = a.orbitRadius,
			startAngle = angleA,
			endAngle = angleB,
			arcAngle = arcAngle,
		}
	else
		return { type = "line", a = aId, b = bId }
	end
end

for id, node in pairs(tree.nodes) do
	if id ~= "root" and node.out then
		local aMeta = nodeMeta[tostring(id)]
		if aMeta then
			for _, target in ipairs(node.out) do
				local a, b = tostring(id), tostring(target)
				local key = a < b and (a .. "-" .. b) or (b .. "-" .. a)
				if not seenConn[key] then
					local bMeta = nodeMeta[b]
					if shouldEmitConnection(aMeta, bMeta) then
						seenConn[key] = true
						table.insert(connections, classifyConnection(a, b, aMeta, bMeta))
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
