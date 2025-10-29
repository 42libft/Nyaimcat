"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCommandCollection = exports.commandModules = void 0;
const discord_js_1 = require("discord.js");
const introduce_1 = require("./introduce");
const help_1 = require("./help");
const ping_1 = require("./ping");
const roles_1 = require("./roles");
const verify_1 = require("./verify");
const version_1 = require("./version");
const esclCsv_1 = require("./esclCsv");
const esclXlsx_1 = require("./esclXlsx");
const feedback_1 = require("./feedback");
const task_1 = require("./task");
const work_1 = require("./work");
const status_1 = require("./status");
const setTeam_1 = require("./setTeam");
const listActive_1 = require("./listActive");
const entry_1 = require("./entry");
const entryNow_1 = require("./entryNow");
const esclAccount_1 = require("./esclAccount");
const health_1 = require("./health");
const rag_1 = require("./rag");
exports.commandModules = [
    help_1.helpCommand,
    version_1.versionCommand,
    esclCsv_1.esclFromParentCsvCommand,
    esclXlsx_1.esclFromParentXlsxCommand,
    setTeam_1.setTeamCommand,
    esclAccount_1.esclAccountCommand,
    listActive_1.listActiveCommand,
    entry_1.entryCommand,
    entryNow_1.entryNowCommand,
    ping_1.pingCommand,
    verify_1.verifyCommand,
    roles_1.rolesCommand,
    introduce_1.introduceCommand,
    feedback_1.feedbackCommand,
    task_1.taskCommand,
    work_1.workCommand,
    status_1.statusCommand,
    health_1.healthCommand,
    rag_1.ragCommand,
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