"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCommandCollection = exports.commandModules = void 0;
const discord_js_1 = require("discord.js");
const introduce_1 = require("./introduce");
const ping_1 = require("./ping");
const roles_1 = require("./roles");
const verify_1 = require("./verify");
exports.commandModules = [
    ping_1.pingCommand,
    verify_1.verifyCommand,
    roles_1.rolesCommand,
    introduce_1.introduceCommand,
];
const buildCommandCollection = () => {
    const collection = new discord_js_1.Collection();
    for (const command of exports.commandModules) {
        collection.set(command.data.name, command);
    }
    return collection;
};
exports.buildCommandCollection = buildCommandCollection;
//# sourceMappingURL=index.js.map