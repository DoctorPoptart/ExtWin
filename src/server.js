const { app, BrowserWindow, nativeImage } = require('electron');
const Store = require('electron-store');
const express = require("express")
const notifier = require('node-notifier');
const path = require('path');

const server = express()
var expressWs = require('express-ws')(server);

server.use(express.json())

const port = 65247
const store = new Store();

const clients = []

const response = (action, arguments) => {
    return {action: action, arguments: arguments}
}

const send = (action, arguments=[]) => {
    for (let i=0; i<clients.length;i++) {
        let websocket = clients[i]
        websocket.send(JSON.stringify({action: action, arguments: arguments}))
    }
}

const objects = {}

const uuidv4 = () => { // Public Domain/MIT
    var d = new Date().getTime();//Timestamp
    var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16;//random number between 0 and 16
        if(d > 0){//Use timestamp until depleted
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {//Use microseconds since page-load if supported
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

const getKeyByValue = (obj, value) => 
        Object.keys(obj).find(key => obj[key] === value);

let object
const addObject = (object) => {
    let object_uuid = getKeyByValue(objects, object)
    if (object_uuid != undefined) {
        return object_uuid
    }
    let uuid = uuidv4()
    objects[uuid] = object
    return uuid
}

const valify = (value, uuid, index="undefined") => {
    let type = typeof(value)
    if (type == "object") {
        return response("object", [`[${index} ${value.constructor.name} ${toString(value)}]`, addObject(value)])
    } else if (type == "function") {
        return response("function_object", [addObject(value), uuid])
    } else {
        return response("values", [value])
    }
}

class Actions {
    static newWindow(htmlFile, options={}) {
        let workspace = store.get("workspace-directory")
        if (!workspace) {
            notifier.notify({
                "title": "Workspace is not set",
                "message": "Your exploit's workspace folder wasn't given"
            })
            return response("error", ["workspace is not set"])
        } 

        let newOptions = {
            width: options.Width,
            height: options.Height,
            x: options.X,
            y: options.Y,
            title: options.Title,
            autoHideMenuBar: options.HideMenuBar,
            maximizable: options.Maximizable,
            resizable: options.Resizable,
            minWidth: options.MinWidth,
            minHeight: options.MinHeight,
            maxWidth: options.MaxWidth,
            maxHeight: options.MaxHeight,
            alwaysOnTop: options.TopMost,
            icon: nativeImage.createFromPath("assets/window.png"),
            webPreferences: {
                preload: path.join(__dirname, "preload.js")
            }
        }

        if (options.Icon) newOptions.icon = nativeImage.createFromPath(path.join(workspace, options.Icon))
        let window = new BrowserWindow(newOptions)

        let htmlPath = path.join(workspace, htmlFile)
        window.loadFile(htmlPath)

        let uuid = addObject(window)

        return response("object", ["BrowserWindow", uuid])
    }
    static objectIndex(uuid, index) {
        object = objects[uuid]
        if (!object) return response("error", [`object does not exist ${uuid}`])

        let value
        try {
            value = object[index]
        } catch(e) {
            return response("error", [e.stack])
        }
        
        return valify(value, uuid, index)
        
    }
    static objectNewIndex(uuid, index, value) {
        object = objects[uuid]
        if (!object) return response("error", [`object does not exist ${uuid}`])

        try {
            object[index] = value
        } catch(e) {
            return response("error", [e.stack])
        }
    
        return response("ignore")

    }
    static runFunction(uuid, parentUuid, ...params) {
        object = objects[uuid]
        let parent = objects[parentUuid]
        if (!object) return response("error", [`object does not exist ${uuid}`])
        if (!parent) return response("error", [`parent does not exist ${uuid}`])

        let value
        try {
            if (parentUuid) {
                value = object.call(parent, ...params)
            } else {
                value = object(...params)
            }
            
        } catch(e) {
            return response("error", [e.stack])
        }
    
        return valify(value)
    }
}

const functionFix = (object) => {
    return (...params) => {
        send("run_function", [object["object_uuid"], ...params])
    }
} 

const objectFix = (object) => {
    object = objects[object["object_uuid"]]
    if (!object) send("error", [`object does not exist ${uuid}`])

    return object
}

const recursiveFix = (object) => {
    for (let key in object) {
        let value = object[key]
        
        if (typeof(value) == "object") {
            let type = value["__type"]
            if (type == "object") {
                object[key] = objectFix(value)
            } else if (type == "function") {
                object[key] = functionFix(value)
            }
        }

    }
    
}

const incomingActionHandler = (action, arguments) => {
    let actionFunction = Actions[action]
    if (!actionFunction) return response("error", ["invalid action name"])
    recursiveFix(arguments)
    return actionFunction(...arguments)
}


server.ws('/websocket', function(ws, req) {
  clients.push(ws)
  ws.send(JSON.stringify({action: "connected"}))
});

let data, action, arguments
server.post("/http", (req, res) => {
    try {
        data = req.body
        action = data.action
        arguments = data.arguments || []
        
        if (!action) return res.json(response("error", ["'action' key is missing from payload."]))

        let payload = incomingActionHandler(action, arguments)
        if (payload) {
            res.json(payload)
        } else {
            res.json({action: "ignore"})
        }

    } catch(e) { 
        console.error(e) 
        return res.json(response("error", [e.stack]))
    }
})

server.get("/alive", (req, res) => {
    res.send("alive")
})

server.listen(port, () => {
    console.log(`app is listening on port ${port}`)
})

