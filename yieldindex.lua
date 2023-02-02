
local c = tick()+(5*1000)
local function b()
    if tick()< c then
        b()
        wait()
    end
end

local function a()
    b()
end

local a = setmetatable({}, {
	__index = function()
		wait(1)
return "ass"

end

})

print(
a.a)