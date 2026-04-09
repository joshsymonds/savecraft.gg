-- wrapper.lua — PoB headless wrapper with JSON-lines protocol over stdin/stdout
--
-- Loads Path of Building's HeadlessWrapper, then enters a read loop:
--   stdin:  one JSON object per line (requests)
--   stdout: one JSON object per line (responses)
--   stderr: status messages and errors for the Go supervisor
--
-- Request types:
--   {"type": "calc", "xml": "<build XML>"}
--   {"type": "ping"}
--
-- Response format:
--   {"type": "result", "data": { ... }}
--   {"type": "error", "message": "..."}

-- PoB source directory. The Go supervisor sets the working directory to this path,
-- so LoadModule's relative paths resolve correctly. POB_DIR is used only for
-- setting up package.path and locating HeadlessWrapper.
local pobDir = os.getenv("POB_DIR") or "."

-- Set up package path for PoB's runtime Lua libraries
package.path = pobDir .. "/?.lua;"
	.. pobDir .. "/?/init.lua;"
	.. pobDir .. "/../runtime/lua/?.lua;"
	.. pobDir .. "/../runtime/lua/?/init.lua;"
	.. package.path

-- Stub native C modules before anything loads them
package.preload['lua-utf8'] = function()
	return {
		reverse = string.reverse,
		gsub = string.gsub,
		find = string.find,
		sub = string.sub,
		len = string.len,
	}
end

-- Patch missing C API functions that HeadlessWrapper doesn't define.
-- HeadlessWrapper defines most stubs (SetMainObject, ConPrintf, etc.)
-- so we only add what's truly missing.
function GetVirtualScreenSize() return 1920, 1080 end

-- Status output goes to stderr so it doesn't mix with JSON protocol
local function log(fmt, ...)
	io.stderr:write(string.format(fmt, ...) .. "\n")
	io.stderr:flush()
end

-- Redirect print() to stderr so PoB's ConPrintf doesn't corrupt the JSON protocol.
-- This is NOT a modification to PoB source — it's a global override in our wrapper
-- that takes effect before HeadlessWrapper loads.
local _print = print
print = function(...)
	local args = {...}
	local parts = {}
	for i = 1, select("#", ...) do
		parts[#parts + 1] = tostring(args[i])
	end
	io.stderr:write(table.concat(parts, "\t") .. "\n")
	io.stderr:flush()
end

log("Loading PoB from %s...", pobDir)

-- Load PoB's HeadlessWrapper (stubs UI, loads Launch.lua -> Main.lua -> all data).
-- The Go supervisor sets the working directory to the PoB source directory,
-- so relative paths in LoadModule resolve correctly.
local loadOk, loadErr = pcall(dofile, pobDir .. "/HeadlessWrapper.lua")
if not loadOk then
	log("FATAL: Failed to load HeadlessWrapper: %s", tostring(loadErr))
	os.exit(1)
end

log("PoB loaded successfully")

-- JSON library is available from PoB's runtime
local dkjson = require("dkjson")

-- Serialize socket groups (skills) from the build
local function serializeSocketGroups(build)
	local groups = {}
	if not build.skillsTab or not build.skillsTab.socketGroupList then
		return groups
	end
	for i, group in ipairs(build.skillsTab.socketGroupList) do
		local gems = {}
		if group.gemList then
			for j, gem in ipairs(group.gemList) do
				local gemInfo = {
					nameSpec = gem.nameSpec or "",
					level = gem.level,
					quality = gem.quality,
					qualityId = gem.qualityId,
					enabled = gem.enabled,
					skillId = gem.skillId,
				}
				if gem.grantedEffect then
					gemInfo.name = gem.grantedEffect.name
					gemInfo.support = gem.grantedEffect.support or false
				end
				gems[#gems + 1] = gemInfo
			end
		end
		groups[#groups + 1] = {
			label = group.label or "",
			enabled = group.enabled,
			slot = group.slot or "",
			gems = gems,
			isMainGroup = (i == build.mainSocketGroup),
		}
	end
	return groups
end

-- Serialize equipped items from the build
local function serializeItems(build)
	local items = {}
	if not build.itemsTab then return items end
	for slotName, slot in pairs(build.itemsTab.slots) do
		if slot.selItemId and slot.selItemId > 0 then
			local item = build.itemsTab.items[slot.selItemId]
			if item then
				items[slotName] = {
					name = item.title or item.name or item.baseName or "Unknown",
					baseName = item.baseName,
					rarity = item.rarity,
					type = item.type,
				}
			end
		end
	end
	return items
end

-- Serialize tree keystones from the build
local function serializeKeystones(build)
	local keystones = {}
	if not build.spec or not build.spec.allocNodes then return keystones end
	for id, node in pairs(build.spec.allocNodes) do
		if node.isKeystone then
			keystones[#keystones + 1] = node.dn or node.name or tostring(id)
		end
	end
	table.sort(keystones)
	return keystones
end

-- Serialize tree allocation summary
local function serializeTreeSummary(build)
	if not build.spec then return {} end
	local allocated = 0
	for _ in pairs(build.spec.allocNodes or {}) do
		allocated = allocated + 1
	end
	return {
		version = build.spec.treeVersion,
		allocated_nodes = allocated,
	}
end

-- Serialize the main calc output stats
local function serializeCalcOutput(build)
	if not build.calcsTab or not build.calcsTab.mainOutput then
		return {}
	end
	local output = build.calcsTab.mainOutput
	local result = {}
	-- Copy all numeric and string values from the output table
	for k, v in pairs(output) do
		local t = type(v)
		if t == "number" or t == "string" or t == "boolean" then
			result[k] = v
		end
	end
	return result
end

-- Process a calc request
local function handleCalc(request)
	local xml = request.xml
	if not xml or xml == "" then
		return { type = "error", message = "missing 'xml' field" }
	end

	-- Load the build from XML
	local calcOk, calcErr = pcall(function()
		loadBuildFromXML(xml, "api-build")
	end)
	if not calcOk then
		return { type = "error", message = "failed to load build: " .. tostring(calcErr) }
	end

	-- Note: `build` is a global set by HeadlessWrapper after loadBuildFromXML
	-- calls SetMode("BUILD"), so it should already point to the current build.

	-- Force a full recalculation
	build.buildFlag = true
	runCallback("OnFrame")

	-- Serialize results
	local result = {
		type = "result",
		data = {
			character = {
				class = build.spec.curClassName,
				ascendancy = build.spec.curAscendClassName,
				level = build.characterLevel,
				bandit = build.bandit,
			},
			stats = serializeCalcOutput(build),
			socket_groups = serializeSocketGroups(build),
			items = serializeItems(build),
			keystones = serializeKeystones(build),
			tree = serializeTreeSummary(build),
		}
	}

	return result
end

-- ---------------------------------------------------------------------------
-- Name → object indexes (built lazily, cached for process lifetime)
-- ---------------------------------------------------------------------------

local gemIndex     -- name (lower) → gem data from build.data.gems
local uniqueIndex  -- name (lower) → { raw = raw_text, type = item_type }
local nodeIndex    -- name (lower) → tree node

local function ensureGemIndex()
	if gemIndex then return end
	gemIndex = {}
	if not build or not build.data or not build.data.gems then return end
	for id, gem in pairs(build.data.gems) do
		if gem.name then
			gemIndex[gem.name:lower()] = gem
		end
	end
	log("Built gem index: %d entries", 0) -- count for debugging
	local count = 0
	for _ in pairs(gemIndex) do count = count + 1 end
	log("Built gem index: %d entries", count)
end

local function ensureUniqueIndex()
	if uniqueIndex then return end
	uniqueIndex = {}
	if not build or not build.data or not build.data.uniques then return end
	for itemType, list in pairs(build.data.uniques) do
		for _, raw in ipairs(list) do
			-- Extract name from first line of the raw text
			local name = raw:match("^(.-)\n")
			if name then
				uniqueIndex[name:lower()] = { raw = raw, type = itemType }
			end
		end
	end
	local count = 0
	for _ in pairs(uniqueIndex) do count = count + 1 end
	log("Built unique index: %d entries", count)
end

local function ensureNodeIndex()
	if nodeIndex then return end
	nodeIndex = {}
	if not build or not build.spec or not build.spec.tree then return end
	for id, node in pairs(build.spec.tree.nodes) do
		local name = node.dn or node.name
		if name and (node.isKeystone or node.isNotable) then
			nodeIndex[name:lower()] = node
		end
	end
	local count = 0
	for _ in pairs(nodeIndex) do count = count + 1 end
	log("Built node index: %d entries (keystones + notables)", count)
end

-- ---------------------------------------------------------------------------
-- Modify operation handlers
-- ---------------------------------------------------------------------------

local function applySetLevel(op)
	if not op.level then return "set_level: missing 'level'" end
	build.characterLevel = op.level
	return nil
end

local function applyToggleKeystone(op)
	if not op.name then return "toggle_keystone: missing 'name'" end
	ensureNodeIndex()
	local node = nodeIndex[op.name:lower()]
	if not node then return "toggle_keystone: keystone not found: " .. op.name end
	if op.enabled == false then
		build.spec:DeallocNode(node)
	else
		build.spec:AllocNode(node)
	end
	return nil
end

local function applyAllocateNode(op)
	if not op.name then return "allocate_node: missing 'name'" end
	ensureNodeIndex()
	local node = nodeIndex[op.name:lower()]
	if not node then return "allocate_node: node not found: " .. op.name end
	build.spec:AllocNode(node)
	return nil
end

local function applyDeallocateNode(op)
	if not op.name then return "deallocate_node: missing 'name'" end
	ensureNodeIndex()
	local node = nodeIndex[op.name:lower()]
	if not node then return "deallocate_node: node not found: " .. op.name end
	build.spec:DeallocNode(node)
	return nil
end

local function applySwapGem(op)
	if not op.new_gem then return "swap_gem: missing 'new_gem'" end
	ensureGemIndex()
	local gemData = gemIndex[op.new_gem:lower()]
	if not gemData then return "swap_gem: gem not found: " .. op.new_gem end

	local groupIdx = (op.socket_group or 0) + 1 -- Lua is 1-indexed
	local gemIdx = (op.gem_index or 0) + 1
	local groups = build.skillsTab.socketGroupList
	if not groups[groupIdx] then return "swap_gem: socket group not found" end
	local group = groups[groupIdx]
	if not group.gemList[gemIdx] then return "swap_gem: gem index out of range" end

	group.gemList[gemIdx] = {
		nameSpec = gemData.name,
		level = op.level or 20,
		quality = op.quality or 20,
		qualityId = op.quality_id or "Default",
		enabled = true,
		gemId = gemData.id,
		skillId = gemData.grantedEffectId,
	}
	build.skillsTab:ProcessSocketGroup(group)
	return nil
end

local function applyAddGem(op)
	if not op.gem then return "add_gem: missing 'gem'" end
	ensureGemIndex()
	local gemData = gemIndex[op.gem:lower()]
	if not gemData then return "add_gem: gem not found: " .. op.gem end

	local groupIdx = (op.socket_group or 0) + 1
	local groups = build.skillsTab.socketGroupList
	if not groups[groupIdx] then return "add_gem: socket group not found" end
	local group = groups[groupIdx]

	group.gemList[#group.gemList + 1] = {
		nameSpec = gemData.name,
		level = op.level or 20,
		quality = op.quality or 20,
		qualityId = op.quality_id or "Default",
		enabled = true,
		gemId = gemData.id,
		skillId = gemData.grantedEffectId,
	}
	build.skillsTab:ProcessSocketGroup(group)
	return nil
end

local function applyRemoveGem(op)
	local groupIdx = (op.socket_group or 0) + 1
	local gemIdx = (op.gem_index or 0) + 1
	local groups = build.skillsTab.socketGroupList
	if not groups[groupIdx] then return "remove_gem: socket group not found" end
	local group = groups[groupIdx]
	if not group.gemList[gemIdx] then return "remove_gem: gem index out of range" end

	table.remove(group.gemList, gemIdx)
	build.skillsTab:ProcessSocketGroup(group)
	return nil
end

local function applyEquipUnique(op)
	if not op.name then return "equip_unique: missing 'name'" end
	if not op.slot then return "equip_unique: missing 'slot'" end
	ensureUniqueIndex()
	local entry = uniqueIndex[op.name:lower()]
	if not entry then return "equip_unique: unique not found: " .. op.name end

	local item = new("Item", entry.raw)
	build.itemsTab:AddItem(item, true) -- noAutoEquip

	-- Find the target slot and equip
	local activeSet = build.itemsTab.activeItemSet
	local itemSet = build.itemsTab.itemSets[activeSet]
	if itemSet and itemSet[op.slot] then
		itemSet[op.slot].selItemId = item.id
	else
		-- Try direct slot access
		for _, slot in ipairs(build.itemsTab.orderedSlots) do
			if slot.slotName == op.slot then
				slot.selItemId = item.id
				break
			end
		end
	end
	return nil
end

local function applySetItem(op)
	if not op.text then return "set_item: missing 'text'" end
	if not op.slot then return "set_item: missing 'slot'" end

	local item = new("Item", op.text)
	build.itemsTab:AddItem(item, true)

	local activeSet = build.itemsTab.activeItemSet
	local itemSet = build.itemsTab.itemSets[activeSet]
	if itemSet and itemSet[op.slot] then
		itemSet[op.slot].selItemId = item.id
	else
		for _, slot in ipairs(build.itemsTab.orderedSlots) do
			if slot.slotName == op.slot then
				slot.selItemId = item.id
				break
			end
		end
	end
	return nil
end

-- Dispatch table for operations
local opHandlers = {
	set_level        = applySetLevel,
	toggle_keystone  = applyToggleKeystone,
	allocate_node    = applyAllocateNode,
	deallocate_node  = applyDeallocateNode,
	swap_gem         = applySwapGem,
	add_gem          = applyAddGem,
	remove_gem       = applyRemoveGem,
	equip_unique     = applyEquipUnique,
	set_item         = applySetItem,
}

-- Process a modify request
local function handleModify(request)
	local xml = request.xml
	if not xml or xml == "" then
		return { type = "error", message = "missing 'xml' field" }
	end
	local ops = request.operations
	if not ops or #ops == 0 then
		return { type = "error", message = "missing 'operations' field" }
	end

	-- Load the build from XML
	local loadOk, loadErr = pcall(function()
		loadBuildFromXML(xml, "modify-build")
	end)
	if not loadOk then
		return { type = "error", message = "failed to load build: " .. tostring(loadErr) }
	end

	-- Invalidate cached indexes (new build may have different tree/data)
	nodeIndex = nil

	-- Apply each operation in order
	for i, op in ipairs(ops) do
		if not op.op then
			return { type = "error", message = "operation " .. i .. ": missing 'op' field" }
		end
		local handler = opHandlers[op.op]
		if not handler then
			return { type = "error", message = "operation " .. i .. ": unknown op: " .. op.op }
		end
		local errMsg = handler(op)
		if errMsg then
			return { type = "error", message = "operation " .. i .. ": " .. errMsg }
		end
	end

	-- Recalculate
	build.buildFlag = true
	runCallback("OnFrame")

	-- Export the modified build to XML
	local modifiedXml = build:SaveDB("modified")

	-- Serialize results (same as handleCalc)
	return {
		type = "result",
		data = {
			character = {
				class = build.spec.curClassName,
				ascendancy = build.spec.curAscendClassName,
				level = build.characterLevel,
				bandit = build.bandit,
			},
			stats = serializeCalcOutput(build),
			socket_groups = serializeSocketGroups(build),
			items = serializeItems(build),
			keystones = serializeKeystones(build),
			tree = serializeTreeSummary(build),
		},
		xml = modifiedXml,
	}
end

-- Main request loop
log("Ready for requests")

for line in io.stdin:lines() do
	-- Parse the request
	local request, pos, err = dkjson.decode(line)
	if not request then
		local resp = dkjson.encode({ type = "error", message = "invalid JSON: " .. tostring(err) })
		io.stdout:write(resp .. "\n")
		io.stdout:flush()
	else
		local response
		if request.type == "calc" then
			local ok, result = pcall(handleCalc, request)
			if ok then
				response = result
			else
				response = { type = "error", message = "calc crashed: " .. tostring(result) }
			end
		elseif request.type == "modify" then
			local ok, result = pcall(handleModify, request)
			if ok then
				response = result
			else
				response = { type = "error", message = "modify crashed: " .. tostring(result) }
			end
		elseif request.type == "ping" then
			response = { type = "pong" }
		else
			response = { type = "error", message = "unknown request type: " .. tostring(request.type) }
		end

		local encoded = dkjson.encode(response)
		io.stdout:write(encoded .. "\n")
		io.stdout:flush()
	end
end

log("stdin closed, exiting")
