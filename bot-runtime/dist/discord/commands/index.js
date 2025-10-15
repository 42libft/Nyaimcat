"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCommandCollection = exports.commandModules = void 0;
const discord_js_1 = require("discord.js");
const ping_1 = require("./ping");
exports.commandModules = [ping_1.pingCommand];
const buildCommandCollection = () => {
    const collection = new discord_js_1.Collection();
    for (const command of exports.commandModules) {
        collection.set(command.data.name, command);
    }
    return collection;
};
exports.buildCommandCollection = buildCommandCollection;
//# sourceMappingURL=index.js.map