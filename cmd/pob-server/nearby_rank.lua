-- nearby_rank.lua — pure per-metric ranker for /nearby candidate evaluation.
-- Extracted from wrapper.lua handleNearby so the sort/tiebreaker logic is
-- unit-testable against fake candidate fixtures without loading PoB.
--
-- A "candidate" is a table with at least:
--   { name, path_cost, deltas = { [statKey] = number, ... } }
-- and optionally these passthrough fields preserved into the output:
--   type, stats, path
--
-- rank() computes per-candidate efficiency = delta_for_metric / path_cost,
-- sorts by (efficiency [order], path_cost asc, name asc), and returns the top
-- N. Sort order is "desc" (highest efficiency first, the default) or "asc"
-- (lowest first — useful for finding cheap travel).

local M = {}

local function efficiencyFor(candidate, metric)
	local delta = 0
	if candidate.deltas ~= nil and candidate.deltas[metric] ~= nil then
		delta = candidate.deltas[metric]
	end
	if candidate.path_cost == nil or candidate.path_cost <= 0 then
		return 0
	end
	return delta / candidate.path_cost
end

function M.rank(candidates, metric, sortOrder, limit)
	local ranked = {}
	for i = 1, #candidates do
		local c = candidates[i]
		ranked[#ranked + 1] = {
			name = c.name,
			type = c.type,
			stats = c.stats,
			path_cost = c.path_cost,
			path = c.path,
			deltas = c.deltas,
			efficiency = efficiencyFor(c, metric),
		}
	end

	local ascending = sortOrder == "asc"
	if ascending then
		table.sort(ranked, function(a, b)
			if a.efficiency ~= b.efficiency then
				return a.efficiency < b.efficiency
			end
			if a.path_cost ~= b.path_cost then
				return (a.path_cost or 0) < (b.path_cost or 0)
			end
			return (a.name or "") < (b.name or "")
		end)
	else
		table.sort(ranked, function(a, b)
			if a.efficiency ~= b.efficiency then
				return a.efficiency > b.efficiency
			end
			if a.path_cost ~= b.path_cost then
				return (a.path_cost or 0) < (b.path_cost or 0)
			end
			return (a.name or "") < (b.name or "")
		end)
	end

	local cap = limit
	if cap == nil or cap > #ranked then
		cap = #ranked
	end
	local top = {}
	for i = 1, cap do
		top[i] = ranked[i]
	end
	return top
end

return M
