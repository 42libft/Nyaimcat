"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCommandCollection = exports.commandModules = void 0;
const discord_js_1 = require("discord.js");
const introduce_1 = require("./introduce");
const ping_1 = require("./ping");
const roles_1 = require("./roles");
const verify_1 = require("./verify");
const version_1 = require("./version");
const esclCsv_1 = require("./esclCsv");
const esclXlsx_1 = require("./esclXlsx");
const feedback_1 = require("./feedback");
exports.commandModules = [
    version_1.versionCommand,
    esclCsv_1.esclFromParentCsvCommand,
    esclXlsx_1.esclFromParentXlsxCommand,
    ping_1.pingCommand,
    verify_1.verifyCommand,
    roles_1.rolesCommand,
    introduce_1.introduceCommand,
    feedback_1.feedbackCommand,
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