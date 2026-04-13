-- audit_segment.lua — pure Lua segmentation of an allocated passive tree.
--
-- Operates on a generic graph shape so it can be unit-tested in isolation
-- from PoB. The extraction layer (in wrapper.lua handleAudit) maps PoB's
-- build.spec.nodes / node.linked / node.alloc / node.type / node.ascendancyName
-- into this shape before calling segment().
--
-- Input shape:
--   nodes: { [id] = { type = "Normal"|"Notable"|"Keystone"|"Mastery"|
--                            "Socket"|"ClassStart"|"AscendClassStart" } }
--          (only allocated nodes appear; presence in this table = allocated)
--   adjacency: { [id] = { neighborId, ... } }
--          (must already be filtered to allocated-only neighbors;
--           the segmentation algorithm trusts this)
--   rootId: id of the immutable anchor (class start for tree scope,
--           ascendClass start for ascendancy scope)
--
-- Output shape: branches[] where each entry is:
--   { id           = string,                 -- stable per call: "branch_<anchor>_<headId>"
--     anchor       = id,                     -- the AP (or root) the branch hangs from
--     head         = id,                     -- the DFS-child entrypoint of the branch
--     nodes        = { id, ... },            -- members of this branch (NOT including anchor)
--     node_count   = int,
--     terminal     = { id, type } | nil,     -- deepest Notable/Keystone in the branch
--     pure_travel  = bool }                  -- true iff terminal == nil
--
-- A branch is a DFS subtree rooted at node v whose only attachment to the rest
-- of the allocated graph is via v's parent edge — i.e. the (parent[v], v) edge
-- is a bridge. Strict inequality low[v] > disc[parent[v]] is required: with
-- equality (the articulation-point condition) a back edge from v's subtree to
-- v's parent would still satisfy ≥, but the parent's neighborhood reaches v
-- through the back edge without the tree edge, so v's subtree isn't actually a
-- pendant. Bridge semantics give clean "this is the path that exists for
-- terminal X" branches. Nested bridges produce nested branches (the outer
-- larger branch AND each smaller inner branch are both reported, so the LLM
-- can choose how aggressively to prune). DFS children of the root are always
-- emitted regardless of bridge status — the root is the immutable anchor and
-- each direct child subtree is a separable region.
--
-- The algorithm is iterative Tarjan articulation-point DFS — recursion is
-- avoided so large allocated trees don't blow the Lua stack.

local M = {}

local function classifyTerminal(branchNodes, nodes, disc)
	local best = nil
	for i = 1, #branchNodes do
		local id = branchNodes[i]
		local nodeType = nodes[id].type
		if nodeType == "Keystone" or nodeType == "Notable" then
			if best == nil then
				best = { id = id, type = nodeType, depth = disc[id] }
			else
				-- Keystone always wins over Notable.
				-- Otherwise: deeper wins. Tie on depth → higher id wins (deterministic).
				local replace = false
				if nodeType == "Keystone" and best.type ~= "Keystone" then
					replace = true
				elseif nodeType == best.type then
					if disc[id] > best.depth then
						replace = true
					elseif disc[id] == best.depth and id > best.id then
						replace = true
					end
				end
				if replace then
					best = { id = id, type = nodeType, depth = disc[id] }
				end
			end
		end
	end
	if best == nil then
		return nil
	end
	return { id = best.id, type = best.type }
end

local function collectSubtree(head, dfsChildren)
	local result = {}
	local stack = { head }
	while #stack > 0 do
		local n = stack[#stack]
		stack[#stack] = nil
		result[#result + 1] = n
		local children = dfsChildren[n]
		if children then
			for i = 1, #children do
				stack[#stack + 1] = children[i]
			end
		end
	end
	return result
end

-- Iterative Tarjan articulation-point DFS.
-- Returns disc, low, parent, dfsChildren keyed by node id.
local function dfs(nodes, adjacency, rootId)
	local disc, low, parent, dfsChildren = {}, {}, {}, {}
	local timer = 0

	disc[rootId] = timer
	low[rootId] = timer
	timer = timer + 1

	-- Each frame = { u = id, idx = next neighbor index to visit }
	local stack = { { u = rootId, idx = 1 } }

	while #stack > 0 do
		local frame = stack[#stack]
		local u = frame.u
		local neighbors = adjacency[u]
		local advanced = false

		if neighbors ~= nil then
			while frame.idx <= #neighbors do
				local v = neighbors[frame.idx]
				frame.idx = frame.idx + 1
				if nodes[v] ~= nil then
					if disc[v] == nil then
						-- Tree edge
						parent[v] = u
						disc[v] = timer
						low[v] = timer
						timer = timer + 1
						local kids = dfsChildren[u]
						if kids == nil then
							kids = {}
							dfsChildren[u] = kids
						end
						kids[#kids + 1] = v
						stack[#stack + 1] = { u = v, idx = 1 }
						advanced = true
						break
					elseif v ~= parent[u] then
						-- Back edge
						if disc[v] < low[u] then
							low[u] = disc[v]
						end
					end
				end
			end
		end

		if not advanced then
			-- Done with u: propagate low to its parent.
			local p = parent[u]
			if p ~= nil then
				if low[u] < low[p] then
					low[p] = low[u]
				end
			end
			stack[#stack] = nil
		end
	end

	return disc, low, parent, dfsChildren
end

-- segment splits the allocated subgraph rooted at rootId into branches.
-- Returns {} when rootId is missing from nodes.
function M.segment(nodes, adjacency, rootId)
	if nodes[rootId] == nil then
		return {}
	end

	local disc, low, parent, dfsChildren = dfs(nodes, adjacency, rootId)

	local branches = {}

	-- For every non-root node v reachable from root via DFS, if the edge
	-- (parent[v], v) is a bridge, the subtree at v is a branch. The bridge
	-- condition is low[v] > disc[parent[v]] (strict). DFS children of the root
	-- are always emitted, even if not strict bridges, because the root is the
	-- immutable anchor and we always want to surface the top-level partitions.
	for id, _ in pairs(disc) do
		if id ~= rootId then
			local p = parent[id]
			local emit = false
			if p == rootId then
				emit = true
			elseif p ~= nil and low[id] > disc[p] then
				emit = true
			end
			if emit then
				local subtreeNodes = collectSubtree(id, dfsChildren)
				local terminal = classifyTerminal(subtreeNodes, nodes, disc)
				branches[#branches + 1] = {
					id = "branch_" .. tostring(p) .. "_" .. tostring(id),
					anchor = p,
					head = id,
					nodes = subtreeNodes,
					node_count = #subtreeNodes,
					terminal = terminal,
					pure_travel = terminal == nil,
				}
			end
		end
	end

	-- Sort branches by head id for deterministic output. Without this the
	-- pairs() iteration above gives arbitrary order and downstream consumers
	-- (rank truncation, test snapshots) become run-to-run flaky.
	table.sort(branches, function(a, b)
		return a.head < b.head
	end)

	return branches
end

return M
