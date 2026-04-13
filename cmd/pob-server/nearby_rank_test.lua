-- nearby_rank_test.lua — pure-Lua tests for nearby_rank.

package.path = "./?.lua;" .. package.path
local nr = require("nearby_rank")

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

local function cand(name_, pathCost, lifeDelta, dpsDelta)
	return {
		name = name_,
		type = "notable",
		path_cost = pathCost,
		stats = { name_ .. " stat" },
		path = { "x", name_ },
		deltas = { Life = lifeDelta or 0, CombinedDPS = dpsDelta or 0 },
	}
end

-- ----------------------------------------------------------------------------

test("empty_input_returns_empty", function(name)
	local r = nr.rank({}, "Life", "desc", 10)
	assertEq(name, #r, 0)
end)

test("single_candidate_computes_efficiency", function(name)
	local r = nr.rank({ cand("A", 4, 1200, 0) }, "Life", "desc", 10)
	assertEq(name .. "/count", #r, 1)
	assertEq(name .. "/efficiency", r[1].efficiency, 300) -- 1200 / 4
end)

test("desc_sort_highest_first", function(name)
	local r = nr.rank({
		cand("A", 4, 800, 0), -- 200
		cand("B", 4, 1600, 0), -- 400
		cand("C", 4, 400, 0), -- 100
	}, "Life", "desc", 10)
	assertEq(name .. "/0", r[1].name, "B")
	assertEq(name .. "/1", r[2].name, "A")
	assertEq(name .. "/2", r[3].name, "C")
end)

test("asc_sort_lowest_first", function(name)
	local r = nr.rank({
		cand("A", 4, 800, 0), -- 200
		cand("B", 4, 1600, 0), -- 400
		cand("C", 4, 400, 0), -- 100
	}, "Life", "asc", 10)
	assertEq(name .. "/0", r[1].name, "C")
	assertEq(name .. "/1", r[2].name, "A")
	assertEq(name .. "/2", r[3].name, "B")
end)

test("efficiency_tie_path_cost_asc_wins", function(name)
	-- A and B both yield efficiency 100. A has lower path_cost, A wins regardless of order.
	local r = nr.rank({
		cand("A", 2, 200, 0),
		cand("B", 4, 400, 0),
	}, "Life", "desc", 10)
	assertEq(name .. "/0", r[1].name, "A")
	assertEq(name .. "/1", r[2].name, "B")
end)

test("efficiency_and_path_cost_tie_name_asc_wins", function(name)
	local r = nr.rank({
		cand("Zeb", 4, 400, 0),
		cand("Aaron", 4, 400, 0),
	}, "Life", "desc", 10)
	assertEq(name .. "/0", r[1].name, "Aaron")
	assertEq(name .. "/1", r[2].name, "Zeb")
end)

test("limit_truncates", function(name)
	local r = nr.rank({
		cand("A", 1, 100, 0),
		cand("B", 1, 200, 0),
		cand("C", 1, 300, 0),
		cand("D", 1, 400, 0),
	}, "Life", "desc", 2)
	assertEq(name .. "/count", #r, 2)
	assertEq(name .. "/0", r[1].name, "D")
	assertEq(name .. "/1", r[2].name, "C")
end)

test("limit_larger_than_input_returns_all", function(name)
	local r = nr.rank({ cand("A", 1, 100, 0) }, "Life", "desc", 99)
	assertEq(name, #r, 1)
end)

test("path_cost_zero_no_crash_efficiency_zero", function(name)
	local r = nr.rank({ cand("A", 0, 1000, 0) }, "Life", "desc", 10)
	assertEq(name .. "/count", #r, 1)
	assertEq(name .. "/efficiency", r[1].efficiency, 0)
end)

test("path_cost_negative_treated_as_zero", function(name)
	local r = nr.rank({ cand("A", -1, 1000, 0) }, "Life", "desc", 10)
	assertEq(name .. "/efficiency", r[1].efficiency, 0)
end)

test("missing_metric_in_deltas_treated_as_zero", function(name)
	local r = nr.rank({ cand("A", 4, 800, 0) }, "Armour", "desc", 10) -- no Armour key
	assertEq(name .. "/efficiency", r[1].efficiency, 0)
end)

test("preserves_passthrough_fields", function(name)
	local r = nr.rank({ cand("A", 4, 800, 100) }, "Life", "desc", 10)
	assertEq(name .. "/type", r[1].type, "notable")
	assertEq(name .. "/stats0", r[1].stats[1], "A stat")
	assertEq(name .. "/path0", r[1].path[1], "x")
	assertEq(name .. "/deltas_dps", r[1].deltas.CombinedDPS, 100)
end)

io.write(string.format("\n%d/%d tests passed\n", total - failures, total))
if failures > 0 then
	os.exit(1)
end
