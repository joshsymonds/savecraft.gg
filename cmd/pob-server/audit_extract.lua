-- audit_extract.lua — walks a PoB passive spec into the generic graph shape
-- consumed by audit_segment.segment().
--
-- Designed against the real PoB accessors (see .reference/pob/src/Classes/
-- PassiveSpec.lua) so the only contact point with PoB is the `spec` table
-- handed in. This makes the extraction layer fully testable with a hand-rolled
-- fake spec — no PoB load required.
--
-- spec accessors used:
--   spec.nodes[id]         → node objects keyed by integer id
--   spec.curClass.startNodeId        → tree root (immutable class start)
--   spec.curAscendClass.startNodeId  → ascendancy root (nil if no ascendancy)
--
-- node fields used:
--   node.id              integer
--   node.alloc           boolean
--   node.type            "Normal"|"Notable"|"Keystone"|"Mastery"|"Socket"|
--                        "ClassStart"|"AscendClassStart"
--   node.ascendancyName  nil for tree nodes, string for ascendancy nodes
--   node.linked          array of resolved neighbor node references
--                        (built by PassiveSpec at spec-build time, see
--                        .reference/pob/src/Classes/PassiveSpec.lua:56-57)

local M = {}

-- rootIdFor picks the immutable anchor node for the requested scope, or nil
-- when no such anchor exists (e.g. ascendancy scope with no ascendancy chosen).
local function rootIdFor(spec, scope)
	if scope == "tree" then
		if spec.curClass and spec.curClass.startNodeId then
			return spec.curClass.startNodeId
		end
	elseif scope == "ascendancy" then
		if spec.curAscendClass and spec.curAscendClass.startNodeId then
			return spec.curAscendClass.startNodeId
		end
	end
	return nil
end

local function inScope(node, scope)
	if not node.alloc then
		return false
	end
	if scope == "tree" then
		return node.ascendancyName == nil
	end
	if scope == "ascendancy" then
		return node.ascendancyName ~= nil
	end
	return false
end

-- extract walks an allocated passive spec into the segmentation graph shape.
-- Returns nodes, adjacency, rootId, totalAllocated.
-- nodes/adjacency are empty and rootId is nil when:
--   - scope is unknown
--   - scope's anchor accessor is missing
--   - the anchor node is not allocated (defensive)
function M.extract(spec, scope)
	local rootId = rootIdFor(spec, scope)
	if rootId == nil then
		return {}, {}, nil, 0
	end
	if not spec.nodes then
		return {}, {}, nil, 0
	end

	-- First pass: collect in-scope allocated nodes.
	local nodes = {}
	local total = 0
	for id, node in pairs(spec.nodes) do
		if inScope(node, scope) then
			nodes[id] = { type = node.type }
			total = total + 1
		end
	end

	-- Defensive: anchor must itself be in scope and allocated.
	if nodes[rootId] == nil then
		return {}, {}, nil, 0
	end

	-- Second pass: build adjacency lists, dropping any neighbor that isn't
	-- in scope. Segmentation MUST NOT walk into out-of-scope nodes — they're
	-- not in the `nodes` table and would be silently skipped by the dfs's
	-- `nodes[v] ~= nil` guard, but filtering them out at extract time keeps
	-- the lists tight.
	local adjacency = {}
	for id, _ in pairs(nodes) do
		local node = spec.nodes[id]
		local neighbors = {}
		if node.linked then
			for i = 1, #node.linked do
				local other = node.linked[i]
				if other and other.id and nodes[other.id] then
					neighbors[#neighbors + 1] = other.id
				end
			end
		end
		adjacency[id] = neighbors
	end

	return nodes, adjacency, rootId, total
end

return M
