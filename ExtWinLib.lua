local HttpService = game:GetService("HttpService")
local JSONEncode = HttpService.JSONEncode
local JSONDecode = HttpService.JSONDecode
local GenerateGUID = HttpService.GenerateGUID

local format = string.format

local wait = task.wait

local websocket_connect = (syn and syn.websocket.connect) or (WebSocket and WebSocket.connect)
local _request = (syn and syn.request) or (http and http.request)

local port = 65247
local http_url = format("http://127.0.0.1:%s/http", port)
local websocket_url = format("ws://127.0.0.1:%s/websocket", port)

local incoming_action_handler

local functions = {}
local function function_fix(f)
    local guid = GenerateGUID(HttpService, false)
    functions[guid] = f

    return {__type = "function", object_uuid = guid}
end

local function recursive_fix(object)
    for key, value in pairs(object) do
        local key_value = key
        local value_value = value

        local key_type = typeof(key)
        local value_type = typeof(value)

        if key_type == "table" then
            object[key] = nil
            key_value = recursive_fix(key)
        elseif key_type == "function" then
            object[key] = nil
            key_value = function_fix(key)
        end

        if value_type == "table" then
            value_value = recursive_fix(value)
        elseif value_type == "function" then
            value_value = function_fix(value)
        end

        object[key_value] = value_value
    end
    return object
end

local function HttpPost(data)
    recursive_fix(data)
    return _request({
        Url = http_url,
        Method = "POST",
        Headers = {
            ["Content-Type"] = "application/json"
        },
        Body = JSONEncode(HttpService, data)
    }).Body
end

local function response_data_handler(data, function_name)
    local action = data.action
    local arguments = data.arguments or {}

    if not action then
        return error(format("missing action key in %s", function_name))
    end

    return action, arguments
end

local function response(action, arguments)
    return {action = action, arguments = arguments}
end

local objects = {}

local function object_tostring(self)
    return rawget(self, "__name")
end

local function object_index(self, index)
    local uuid = rawget(self, "object_uuid")
    local response_string = HttpPost(response("objectIndex", {uuid, index}))
    local response_data = JSONDecode(HttpService, response_string)

    local action, arguments = response_data_handler(response_data, "object_index")

    return incoming_action_handler(action, arguments)
end

local function object_newindex(self, index, value)
    local uuid = rawget(self, "object_uuid")
    local response_string = HttpPost(response("objectNewIndex", {uuid, index, value}))
    local response_data = JSONDecode(HttpService, response_string)

    local action, arguments = response_data_handler(response_data, "object_index")

    return incoming_action_handler(action, arguments)
end

local function object_call(self, value_a, value_b)
    if not value_a then
        return error("the first param has to be something")
    end
    local index
    local value
    if typeof(value_a) == "table" then
        index, value = unpack(value_a)
    else
        index = value_a
        value = value_b
    end

    if value == nil then
        return object_index(self, index)
    else
        return object_newindex(self, index, value)
    end
end

local function object_equal(self, value)
    return rawget(self, "object_uuid") == rawget(value, "object_uuid")
end

local function new_object(object_type, uuid)
    local object = {}
    object.object_uuid = uuid
    object.__name = object_type
    object.__type = "object"
    object.__tostring = object_tostring

    object.__call = object_call
    object.__eq = object_equal
    object.index = object_index
    object.newindex = object_newindex
    

    return setmetatable(object, object)
end

local Actions = {}

function Actions.error(message)
    error(message, 0)
end

function Actions.object(object_type, uuid)
    local object = objects[uuid]
    if not object then
        return new_object(object_type, uuid)
    end

    return object
end

local action_object = Actions.object
function Actions.function_object(uuid, parent_uuid)
    local object = action_object("function", uuid)
    rawset(object, "__parent_uuid", parent_uuid)
    
    local object_function = function(...)
        local response_string = HttpPost(response("runFunction", {uuid, parent_uuid, ...}))
        local response_data = JSONDecode(HttpService, response_string)

        local action, arguments = response_data_handler(response_data, "object_index")

        return incoming_action_handler(action, arguments)
    end
    
    return object_function
end

function Actions.run_function(uuid, ...)
    local func = functions[uuid]
    if not func then
        return error(format("function (%s) does not exist", uuid))
    end

    return func(...)
end

function Actions.values(...)
    return ...
end

function Actions.ignore() end

function Actions.connected() end

incoming_action_handler = function(action, arguments)
    local action_function = Actions[action]
    if not action_function then
        return error(format("invalid action name (%s)", action))
    end

    return action_function(unpack(arguments))
end

local ExtWinLib = {}

ExtWinLib._new_object = new_object

function ExtWinLib.new_window(html_path, options)
    if not html_path then
        return error("html_path is required")
    end
    local payload = {
        action = "newWindow",
        arguments = {
            html_path,
            options
        }
    }

    local request_string = HttpPost(payload)
    local request_data = JSONDecode(HttpService, request_string)
    local action = request_data.action
    local arguments = request_data.arguments or {}

    if not action then
        return error("missing action key in response from new_window")
    end

    return incoming_action_handler(action, arguments)
end

function ExtWinLib.remote_function(window, code)
    local web_contents = window{"webContents"}
    local guid = GenerateGUID(HttpService, false)
    web_contents{"executeJavaScript"}(format([[
        window.electron.ipc("%s", (event, variables) => {
            %s
        })
        true
    ]], guid, code))

    return function(...)
        web_contents{"send"}(guid, {...})
    end
end

local function on_message(message)
    local parsed_payload = JSONDecode(HttpService, message)
    local action = parsed_payload.action
    local arguments = parsed_payload.arguments or {}

    if not action then
        return error("'action' key is missing in payload")
    end

    incoming_action_handler(action, arguments)
end

local function websocket_connection_handler()
    while true do
        local websocket = websocket_connect(websocket_url)
        local connection = websocket.OnMessage:Connect(on_message)
        websocket.OnClose:Wait()
        connection:Disconnect()

        wait(8)
    end
end

coroutine.wrap(websocket_connection_handler)()

return ExtWinLib