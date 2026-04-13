-- nearby_filter_test.lua — pure-Lua tests for nearby_filter.

package.path = "./?.lua;" .. package.path
local nf = require("nearby_filter")

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

local function test(name, fn)
	total = total + 1
	local ok, err = pcall(fn, name)
	if not ok then
		fail(name, "Lua error: " .. tostring(err))
	end
end

local function makeNode(props)
	local n = {
		alloc = false,
		pathDist = 1,
		path = { 1 },
		type = "Normal",
		modKey = "some_mod",
		ascendancyName = nil,
	}
	if props then
		for k, v in pairs(props) do
			n[k] = v
		end
	end
	return n
end

-- ----------------------------------------------------------------------------
-- shouldEvaluate
-- ----------------------------------------------------------------------------

test("happy_path_normal", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode(), 5), true)
end)

test("happy_path_notable", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode({ type = "Notable" }), 5), true)
end)

test("happy_path_keystone", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode({ type = "Keystone" }), 5), true)
end)

test("rejects_allocated", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode({ alloc = true }), 5), false)
end)

test("rejects_pathDist_over_radius", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode({ pathDist = 6 }), 5), false)
end)

test("accepts_pathDist_at_radius_boundary", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode({ pathDist = 5 }), 5), true)
end)

test("rejects_nil_pathDist", function(name)
	-- Lua collapses `{ pathDist = nil }` to `{}` so set after construction.
	local n = makeNode()
	n.pathDist = nil
	assertEq(name, nf.shouldEvaluate(n, 5), false)
end)

test("rejects_nil_path", function(name)
	local n = makeNode()
	n.path = nil
	assertEq(name, nf.shouldEvaluate(n, 5), false)
end)

test("rejects_mastery", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode({ type = "Mastery" }), 5), false)
end)

test("rejects_socket", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode({ type = "Socket" }), 5), false)
end)

test("rejects_class_start", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode({ type = "ClassStart" }), 5), false)
end)

test("rejects_ascend_class_start", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode({ type = "AscendClassStart" }), 5), false)
end)

test("rejects_empty_modKey", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode({ modKey = "" }), 5), false)
end)

test("rejects_nil_modKey", function(name)
	local n = makeNode()
	n.modKey = nil
	assertEq(name, nf.shouldEvaluate(n, 5), false)
end)

test("rejects_ascendancy_node", function(name)
	assertEq(name, nf.shouldEvaluate(makeNode({ ascendancyName = "Necromancer" }), 5), false)
end)

-- ----------------------------------------------------------------------------
-- collectStatKeys
-- ----------------------------------------------------------------------------

test("collect_empty_inputs", function(name)
	local result = nf.collectStatKeys({}, {})
	assertEq(name, #result, 0)
end)

test("collect_only_metrics", function(name)
	local result = nf.collectStatKeys({ "Life", "CombinedDPS" }, {})
	assertEq(name .. "/count", #result, 2)
	assertEq(name .. "/0", result[1], "Life")
	assertEq(name .. "/1", result[2], "CombinedDPS")
end)

test("collect_only_deltaStats", function(name)
	local result = nf.collectStatKeys({}, { "Armour", "EnergyShield" })
	assertEq(name .. "/count", #result, 2)
	assertEq(name .. "/0", result[1], "Armour")
end)

test("collect_metrics_then_novel_deltaStats", function(name)
	local result = nf.collectStatKeys({ "Life" }, { "CombinedDPS", "Armour" })
	assertEq(name .. "/count", #result, 3)
	assertEq(name .. "/0", result[1], "Life")
	assertEq(name .. "/1", result[2], "CombinedDPS")
	assertEq(name .. "/2", result[3], "Armour")
end)

test("collect_dedupes_overlap", function(name)
	-- "Life" appears in both — should appear once, in the metrics position.
	local result = nf.collectStatKeys({ "Life", "CombinedDPS" }, { "Life", "Armour" })
	assertEq(name .. "/count", #result, 3)
	assertEq(name .. "/0", result[1], "Life")
	assertEq(name .. "/1", result[2], "CombinedDPS")
	assertEq(name .. "/2", result[3], "Armour")
end)

test("collect_preserves_metrics_order", function(name)
	local result = nf.collectStatKeys({ "C", "A", "B" }, {})
	assertEq(name .. "/0", result[1], "C")
	assertEq(name .. "/1", result[2], "A")
	assertEq(name .. "/2", result[3], "B")
end)

test("collect_handles_nil_inputs", function(name)
	local result = nf.collectStatKeys(nil, nil)
	assertEq(name, #result, 0)
end)

io.write(string.format("\n%d/%d tests passed\n", total - failures, total))
if failures > 0 then
	os.exit(1)
end
