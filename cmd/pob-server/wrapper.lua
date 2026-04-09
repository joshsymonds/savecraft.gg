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
