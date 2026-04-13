-- audit_segment_test.lua — pure-Lua tests for audit_segment.segment().
--
-- Run via: luajit cmd/pob-server/audit_segment_test.lua
-- Driven from Go via audit_segment_test.go which shells out to luajit
-- (or nix-shell -p luajit) and checks exit code + stdout.

-- Make sure the module under test is on package.path. The Go runner cd's into
-- the pob-server directory before invoking us, so a relative require works.
package.path = "./?.lua;" .. package.path

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

local function setOf(list)
	local s = {}
	for i = 1, #list do
		s[list[i]] = true
	end
	return s
end

local function findBranchByHead(branches, head)
	for i = 1, #branches do
		if branches[i].head == head then
			return branches[i]
		end
	end
	return nil
end

local function test(name, fn)
	total = total + 1
	local ok, err = pcall(fn, name)
	if not ok then
		fail(name, "Lua error: " .. tostring(err))
	end
end

-- ----------------------------------------------------------------------------
-- Test 1: empty graph (only the root) → no branches.
test("empty_graph_only_root", function(name)
	local nodes = { [1] = { type = "ClassStart" } }
	local adjacency = { [1] = {} }
	local branches = segment(nodes, adjacency, 1)
	assertEq(name, #branches, 0)
end)

-- ----------------------------------------------------------------------------
-- Test 2: single chain ending at a Notable.
--   1(root) — 2 — 3(Notable)
test("single_chain_with_notable", function(name)
	local nodes = {
		[1] = { type = "ClassStart" },
		[2] = { type = "Normal" },
		[3] = { type = "Notable" },
	}
	local adjacency = {
		[1] = { 2 },
		[2] = { 1, 3 },
		[3] = { 2 },
	}
	local branches = segment(nodes, adjacency, 1)
	-- Cut edges: (1,2), (2,3) → two nested branches: {2,3} and {3}
	assertEq(name .. "/count", #branches, 2)

	local outer = findBranchByHead(branches, 2)
	assertTrue(name .. "/outer", outer ~= nil, "missing outer branch headed at 2")
	if outer then
		assertEq(name .. "/outer/anchor", outer.anchor, 1)
		assertEq(name .. "/outer/node_count", outer.node_count, 2)
		assertTrue(name .. "/outer/contains2", setOf(outer.nodes)[2] == true, "missing node 2")
		assertTrue(name .. "/outer/contains3", setOf(outer.nodes)[3] == true, "missing node 3")
		assertTrue(name .. "/outer/terminal", outer.terminal ~= nil, "expected terminal")
		if outer.terminal then
			assertEq(name .. "/outer/terminal_id", outer.terminal.id, 3)
			assertEq(name .. "/outer/terminal_type", outer.terminal.type, "Notable")
		end
		assertEq(name .. "/outer/pure_travel", outer.pure_travel, false)
	end

	local inner = findBranchByHead(branches, 3)
	assertTrue(name .. "/inner", inner ~= nil, "missing inner branch headed at 3")
	if inner then
		assertEq(name .. "/inner/anchor", inner.anchor, 2)
		assertEq(name .. "/inner/node_count", inner.node_count, 1)
	end
end)

-- ----------------------------------------------------------------------------
-- Test 3: simple fork — root has three independent children, two of which
-- are Notables and one is a pure travel node.
--          1(root)
--         / | \
--        2  3  4
-- 2,3 are Notable; 4 is Normal (no terminal).
test("simple_fork_three_children", function(name)
	local nodes = {
		[1] = { type = "ClassStart" },
		[2] = { type = "Notable" },
		[3] = { type = "Notable" },
		[4] = { type = "Normal" },
	}
	local adjacency = {
		[1] = { 2, 3, 4 },
		[2] = { 1 },
		[3] = { 1 },
		[4] = { 1 },
	}
	local branches = segment(nodes, adjacency, 1)
	assertEq(name .. "/count", #branches, 3)

	for _, head in ipairs({ 2, 3, 4 }) do
		local b = findBranchByHead(branches, head)
		assertTrue(name .. "/branch_" .. head, b ~= nil, "missing branch headed at " .. head)
		if b then
			assertEq(name .. "/branch_" .. head .. "/anchor", b.anchor, 1)
			assertEq(name .. "/branch_" .. head .. "/node_count", b.node_count, 1)
		end
	end

	local pureTravelBranch = findBranchByHead(branches, 4)
	if pureTravelBranch then
		assertEq(name .. "/4/pure_travel", pureTravelBranch.pure_travel, true)
		assertTrue(name .. "/4/no_terminal", pureTravelBranch.terminal == nil, "expected nil terminal")
	end
end)

-- ----------------------------------------------------------------------------
-- Test 4: nested branches with multiple terminals.
--   1(root) — 2(Normal) — 3(Normal) — 4(Notable)
--                              \
--                               5(Normal) — 6(Notable)
test("nested_branches_multiple_terminals", function(name)
	local nodes = {
		[1] = { type = "ClassStart" },
		[2] = { type = "Normal" },
		[3] = { type = "Normal" },
		[4] = { type = "Notable" },
		[5] = { type = "Normal" },
		[6] = { type = "Notable" },
	}
	local adjacency = {
		[1] = { 2 },
		[2] = { 1, 3 },
		[3] = { 2, 4, 5 },
		[4] = { 3 },
		[5] = { 3, 6 },
		[6] = { 5 },
	}
	local branches = segment(nodes, adjacency, 1)
	-- Every non-root node has low[v] >= disc[parent[v]] in a tree (no back edges):
	-- branches headed at 2,3,4,5,6 → 5 branches total.
	assertEq(name .. "/count", #branches, 5)

	local outer = findBranchByHead(branches, 2)
	if outer then
		assertEq(name .. "/outer/node_count", outer.node_count, 5)
		assertTrue(name .. "/outer/has_terminal", outer.terminal ~= nil, "expected terminal")
	end

	-- Branch headed at 5 contains {5, 6} with terminal=6.
	local fiveBranch = findBranchByHead(branches, 5)
	if fiveBranch then
		assertEq(name .. "/5/node_count", fiveBranch.node_count, 2)
		if fiveBranch.terminal then
			assertEq(name .. "/5/terminal_id", fiveBranch.terminal.id, 6)
		end
	end
end)

-- ----------------------------------------------------------------------------
-- Test 5: pure travel branch — no Notables/Keystones reachable.
--   1(root) — 2(Normal) — 3(Normal) — 4(Normal)
test("pure_travel_branch_flagged", function(name)
	local nodes = {
		[1] = { type = "ClassStart" },
		[2] = { type = "Normal" },
		[3] = { type = "Normal" },
		[4] = { type = "Normal" },
	}
	local adjacency = {
		[1] = { 2 },
		[2] = { 1, 3 },
		[3] = { 2, 4 },
		[4] = { 3 },
	}
	local branches = segment(nodes, adjacency, 1)
	for i = 1, #branches do
		assertEq(name .. "/branch" .. i .. "/pure_travel", branches[i].pure_travel, true)
		assertTrue(name .. "/branch" .. i .. "/no_terminal", branches[i].terminal == nil, "expected nil terminal")
	end
end)

-- ----------------------------------------------------------------------------
-- Test 6: Keystone wins terminal classification over Notable at the same
-- branch level.
--   1(root) — 2(Normal) — 3(Notable)
--                       \
--                        4(Keystone)
test("keystone_beats_notable_in_terminal", function(name)
	local nodes = {
		[1] = { type = "ClassStart" },
		[2] = { type = "Normal" },
		[3] = { type = "Notable" },
		[4] = { type = "Keystone" },
	}
	local adjacency = {
		[1] = { 2 },
		[2] = { 1, 3, 4 },
		[3] = { 2 },
		[4] = { 2 },
	}
	local branches = segment(nodes, adjacency, 1)
	local outer = findBranchByHead(branches, 2)
	assertTrue(name .. "/outer", outer ~= nil, "expected outer branch")
	if outer and outer.terminal then
		assertEq(name .. "/outer/terminal_type", outer.terminal.type, "Keystone")
		assertEq(name .. "/outer/terminal_id", outer.terminal.id, 4)
	end
end)

-- ----------------------------------------------------------------------------
-- Test 7: cycle (back edge) prevents false cuts.
--   1(root) — 2 — 3 — 4(Notable)
--                  \      |
--                   ------+
-- Edge (2,4) creates a cycle. Nodes 3 and 4 are inside the cycle, so cutting
-- between 2 and 3 should NOT produce a branch — low[3] < disc[2].
test("back_edge_prevents_false_cut", function(name)
	local nodes = {
		[1] = { type = "ClassStart" },
		[2] = { type = "Normal" },
		[3] = { type = "Normal" },
		[4] = { type = "Notable" },
	}
	local adjacency = {
		[1] = { 2 },
		[2] = { 1, 3, 4 }, -- 2-4 is the back edge
		[3] = { 2, 4 },
		[4] = { 3, 2 },
	}
	local branches = segment(nodes, adjacency, 1)
	-- Only edge (1,2) is a real cut. Inside the {2,3,4} cycle, no internal cuts.
	-- Expected branches: one headed at 2 containing {2,3,4}.
	assertEq(name .. "/count", #branches, 1)
	local outer = findBranchByHead(branches, 2)
	assertTrue(name .. "/outer", outer ~= nil, "expected single branch headed at 2")
	if outer then
		assertEq(name .. "/outer/node_count", outer.node_count, 3)
		local s = setOf(outer.nodes)
		assertTrue(name .. "/contains2", s[2] == true, "missing 2")
		assertTrue(name .. "/contains3", s[3] == true, "missing 3")
		assertTrue(name .. "/contains4", s[4] == true, "missing 4")
	end
end)

-- ----------------------------------------------------------------------------
-- Test 8: root is never inside any branch.
test("root_excluded_from_branches", function(name)
	local nodes = {
		[1] = { type = "ClassStart" },
		[2] = { type = "Notable" },
		[3] = { type = "Notable" },
	}
	local adjacency = {
		[1] = { 2, 3 },
		[2] = { 1 },
		[3] = { 1 },
	}
	local branches = segment(nodes, adjacency, 1)
	for i = 1, #branches do
		local s = setOf(branches[i].nodes)
		assertTrue(name .. "/branch" .. i, s[1] ~= true, "root id 1 must not appear in any branch")
	end
end)

-- ----------------------------------------------------------------------------
-- Test 9: missing root returns empty.
test("missing_root_returns_empty", function(name)
	local nodes = { [2] = { type = "Notable" } }
	local adjacency = { [2] = {} }
	local branches = segment(nodes, adjacency, 1)
	assertEq(name, #branches, 0)
end)

-- ----------------------------------------------------------------------------
-- Summary
io.write(string.format("\n%d/%d tests passed\n", total - failures, total))
if failures > 0 then
	os.exit(1)
end
