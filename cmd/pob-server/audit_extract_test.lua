-- audit_extract_test.lua — pure-Lua tests for audit_extract.extract().
-- Driven from Go via TestAuditExtractionLuaSuite.

package.path = "./?.lua;" .. package.path
local extract = require("audit_extract").extract
local segment = require("audit_segment").segment

local failures = 0
local total = 0

local function fail(name, msg)
	failures = failures + 1
	io.write("FAIL: " .. name .. " — " .. msg .. "\n")
end

local function assertEq(name, got, want)
	if got ~= want then
		fail(name, "expected " .. tostring(want) .. ", got " .. tostring(got))
		return false
	end
	return true
end

local function assertTrue(name, cond, msg)
	if not cond then
		fail(name, msg or "assertion failed")
		return false
	end
	return true
end

local function test(name, fn)
	total = total + 1
	local ok, err = pcall(fn, name)
	if not ok then
		fail(name, "Lua error: " .. tostring(err))
	end
end

-- A tiny fake-spec builder mirroring PoB's surface area. Each node carries the
-- exact fields audit_extract reads (id, alloc, type, ascendancyName, linked).
-- linked uses real Lua references, just like PoB's resolved adjacency.
local function newSpec(classStartId, ascendStartId)
	local spec = { nodes = {} }
	if classStartId ~= nil then
		spec.curClass = { startNodeId = classStartId }
	end
	if ascendStartId ~= nil then
		spec.curAscendClass = { startNodeId = ascendStartId }
	end
	return spec
end

local function addNode(spec, id, props)
	local n = { id = id, alloc = false, type = "Normal", ascendancyName = nil, linked = {} }
	if props then
		for k, v in pairs(props) do
			n[k] = v
		end
	end
	spec.nodes[id] = n
	return n
end

local function link(spec, ...)
	local ids = { ... }
	for i = 1, #ids - 1 do
		local a, b = spec.nodes[ids[i]], spec.nodes[ids[i + 1]]
		a.linked[#a.linked + 1] = b
		b.linked[#b.linked + 1] = a
	end
end

local function setOf(list)
	local s = {}
	for i = 1, #list do
		s[list[i]] = true
	end
	return s
end

-- ----------------------------------------------------------------------------
-- Test 1: only allocated nodes are collected.
test("collects_only_allocated", function(name)
	local spec = newSpec(1)
	addNode(spec, 1, { type = "ClassStart", alloc = true })
	addNode(spec, 2, { type = "Normal", alloc = true })
	addNode(spec, 3, { type = "Notable", alloc = true })
	addNode(spec, 4, { type = "Notable", alloc = false }) -- not allocated
	addNode(spec, 5, { type = "Normal", alloc = false }) -- not allocated
	link(spec, 1, 2, 3)
	link(spec, 3, 4)
	link(spec, 2, 5)

	local nodes, adjacency, rootId, total = extract(spec, "tree")
	assertEq(name .. "/total", total, 3)
	assertEq(name .. "/rootId", rootId, 1)
	assertTrue(name .. "/has_1", nodes[1] ~= nil, "missing 1")
	assertTrue(name .. "/has_2", nodes[2] ~= nil, "missing 2")
	assertTrue(name .. "/has_3", nodes[3] ~= nil, "missing 3")
	assertTrue(name .. "/no_4", nodes[4] == nil, "node 4 should be excluded")
	assertTrue(name .. "/no_5", nodes[5] == nil, "node 5 should be excluded")

	-- Adjacency must NOT reference unallocated neighbors
	assertEq(name .. "/adj2_count", #adjacency[2], 2) -- 1 and 3 only
	local adj2 = setOf(adjacency[2])
	assertTrue(name .. "/adj2_no5", adj2[5] == nil, "node 5 leaked into adjacency[2]")
	assertEq(name .. "/adj3_count", #adjacency[3], 1) -- 2 only (4 is unallocated)
end)

-- ----------------------------------------------------------------------------
-- Test 2: tree scope skips ascendancy nodes.
test("tree_scope_skips_ascendancy", function(name)
	local spec = newSpec(1, 100)
	addNode(spec, 1, { type = "ClassStart", alloc = true })
	addNode(spec, 2, { type = "Notable", alloc = true })
	addNode(spec, 100, { type = "AscendClassStart", alloc = true, ascendancyName = "Necromancer" })
	addNode(spec, 101, { type = "Notable", alloc = true, ascendancyName = "Necromancer" })
	link(spec, 1, 2)
	link(spec, 100, 101)

	local nodes, _, rootId, total = extract(spec, "tree")
	assertEq(name .. "/total", total, 2)
	assertEq(name .. "/rootId", rootId, 1)
	assertTrue(name .. "/no_100", nodes[100] == nil, "ascendancy node 100 leaked")
	assertTrue(name .. "/no_101", nodes[101] == nil, "ascendancy node 101 leaked")
end)

-- ----------------------------------------------------------------------------
-- Test 3: ascendancy scope skips tree nodes.
test("ascendancy_scope_skips_tree", function(name)
	local spec = newSpec(1, 100)
	addNode(spec, 1, { type = "ClassStart", alloc = true })
	addNode(spec, 2, { type = "Notable", alloc = true })
	addNode(spec, 100, { type = "AscendClassStart", alloc = true, ascendancyName = "Necromancer" })
	addNode(spec, 101, { type = "Notable", alloc = true, ascendancyName = "Necromancer" })
	link(spec, 1, 2)
	link(spec, 100, 101)

	local nodes, _, rootId, total = extract(spec, "ascendancy")
	assertEq(name .. "/total", total, 2)
	assertEq(name .. "/rootId", rootId, 100)
	assertTrue(name .. "/no_1", nodes[1] == nil, "tree root 1 leaked")
	assertTrue(name .. "/no_2", nodes[2] == nil, "tree node 2 leaked")
end)

-- ----------------------------------------------------------------------------
-- Test 4: adjacency dropped when the linked neighbor is out of scope.
-- Tree scope: an ascendancy node directly linked to a tree node (the boundary
-- between class start and ascendancy start) must not appear in tree adjacency.
test("adjacency_filtered_to_in_scope", function(name)
	local spec = newSpec(1)
	addNode(spec, 1, { type = "ClassStart", alloc = true })
	addNode(spec, 2, { type = "Normal", alloc = true })
	addNode(spec, 99, { type = "AscendClassStart", alloc = true, ascendancyName = "Necromancer" })
	link(spec, 1, 2)
	link(spec, 1, 99) -- cross-scope edge

	local _, adjacency = extract(spec, "tree")
	assertEq(name .. "/adj1_count", #adjacency[1], 1) -- only 2, NOT 99
	local adj1 = setOf(adjacency[1])
	assertTrue(name .. "/adj1_no99", adj1[99] == nil, "ascendancy node 99 leaked into tree adjacency")
end)

-- ----------------------------------------------------------------------------
-- Test 5: defensive — root not allocated returns empty.
test("returns_empty_for_unallocated_root", function(name)
	local spec = newSpec(1)
	addNode(spec, 1, { type = "ClassStart", alloc = false }) -- root not allocated
	addNode(spec, 2, { type = "Notable", alloc = true })
	link(spec, 1, 2)

	local nodes, adjacency, rootId, total = extract(spec, "tree")
	assertEq(name .. "/total", total, 0)
	assertTrue(name .. "/nodes_empty", next(nodes) == nil, "expected empty nodes")
	assertTrue(name .. "/adj_empty", next(adjacency) == nil, "expected empty adjacency")
	assertEq(name .. "/rootId", rootId, nil)
end)

-- ----------------------------------------------------------------------------
-- Test 6: missing curAscendClass returns empty for ascendancy scope.
test("missing_ascendancy_returns_empty", function(name)
	local spec = newSpec(1) -- no ascendStartId
	addNode(spec, 1, { type = "ClassStart", alloc = true })

	local _, _, rootId, total = extract(spec, "ascendancy")
	assertEq(name .. "/rootId", rootId, nil)
	assertEq(name .. "/total", total, 0)
end)

-- ----------------------------------------------------------------------------
-- Test 7: unknown scope returns empty without crashing.
test("unknown_scope_returns_empty", function(name)
	local spec = newSpec(1)
	addNode(spec, 1, { type = "ClassStart", alloc = true })
	local _, _, rootId, total = extract(spec, "garbage")
	assertEq(name .. "/rootId", rootId, nil)
	assertEq(name .. "/total", total, 0)
end)

-- ----------------------------------------------------------------------------
-- Test 8: end-to-end extract → segment produces sensible branches.
-- Spec: 1(root) — 2(Normal) — 3(Notable); 1 — 4(Notable). Two branches.
test("extract_then_segment_end_to_end", function(name)
	local spec = newSpec(1)
	addNode(spec, 1, { type = "ClassStart", alloc = true })
	addNode(spec, 2, { type = "Normal", alloc = true })
	addNode(spec, 3, { type = "Notable", alloc = true })
	addNode(spec, 4, { type = "Notable", alloc = true })
	link(spec, 1, 2, 3)
	link(spec, 1, 4)

	local nodes, adjacency, rootId = extract(spec, "tree")
	local branches = segment(nodes, adjacency, rootId)

	-- Bridges: (1,2) → branch {2,3}; (2,3) → branch {3}; (1,4) → branch {4}
	assertEq(name .. "/count", #branches, 3)

	-- One branch must contain the {2,3} subtree.
	local outer
	for i = 1, #branches do
		if branches[i].head == 2 then
			outer = branches[i]
			break
		end
	end
	assertTrue(name .. "/outer", outer ~= nil, "missing outer branch headed at 2")
	if outer then
		assertEq(name .. "/outer/node_count", outer.node_count, 2)
		assertTrue(name .. "/outer/has_terminal", outer.terminal ~= nil, "expected terminal")
	end
end)

-- ----------------------------------------------------------------------------
io.write(string.format("\n%d/%d tests passed\n", total - failures, total))
if failures > 0 then
	os.exit(1)
end
