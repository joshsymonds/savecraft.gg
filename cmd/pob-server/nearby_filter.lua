-- nearby_filter.lua — pure predicates + helpers for /nearby's candidate
-- selection pass. Extracted from wrapper.lua handleNearby so the filter
-- criteria can be unit-tested against fake node fixtures without loading PoB.
--
-- Used by handleNearby's hot loop to gate `build.spec.nodes` iteration.

local M = {}

-- shouldEvaluate returns true when `node` is a candidate for nearby
-- evaluation: not currently allocated, within `radius` path-distance of the
-- allocated tree, has a resolved path, is a real passive (not a Mastery,
-- Socket, or class-start marker), carries a non-empty modKey (otherwise it
-- has nothing to contribute), and isn't part of an ascendancy.
--
-- All field accesses match the PoB node shape exposed by PassiveSpec
-- (.reference/pob/src/Classes/PassiveSpec.lua): node.alloc, node.pathDist,
-- node.path, node.type, node.modKey, node.ascendancyName.
function M.shouldEvaluate(node, radius)
	if node.alloc then
		return false
	end
	if node.pathDist == nil or node.pathDist > radius then
		return false
	end
	if node.path == nil then
		return false
	end
	if node.type ~= "Normal" and node.type ~= "Notable" and node.type ~= "Keystone" then
		return false
	end
	if node.modKey == nil or node.modKey == "" then
		return false
	end
	if node.ascendancyName ~= nil then
		return false
	end
	return true
end

-- collectStatKeys deduplicates two stat-key lists, preserving the order from
-- `metrics` (the rank-by stats) and appending novel entries from `deltaStats`
-- (the additional report-only stats). The returned list is the canonical
-- order in which calc deltas should be requested for each candidate, so
-- consistency across the candidate loop matters.
function M.collectStatKeys(metrics, deltaStats)
	local result = {}
	local seen = {}
	if metrics ~= nil then
		for i = 1, #metrics do
			local key = metrics[i]
			if not seen[key] then
				result[#result + 1] = key
				seen[key] = true
			end
		end
	end
	if deltaStats ~= nil then
		for i = 1, #deltaStats do
			local key = deltaStats[i]
			if not seen[key] then
				result[#result + 1] = key
				seen[key] = true
			end
		end
	end
	return result
end

return M
