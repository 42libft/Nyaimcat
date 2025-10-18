"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRegistry = exports.HealthRegistry = void 0;
const logger_1 = require("../utils/logger");
const levelPriority = {
    error: 0,
    warning: 1,
};
class HealthRegistry {
    constructor() {
        this.issues = new Map();
        this.observers = new Set();
    }
    subscribe(observer) {
        this.observers.add(observer);
        return () => {
            this.observers.delete(observer);
        };
    }
    notifyReport(change) {
        for (const observer of Array.from(this.observers)) {
            if (!observer.onReport) {
                continue;
            }
            try {
                const result = observer.onReport(change.issue, change.context);
                if (result && typeof result.catch === "function") {
                    result.catch((error) => {
                        logger_1.logger.warn("ヘルスチェック報告オブザーバの処理でエラーが発生しました", {
                            issueId: change.issue.id,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    });
                }
            }
            catch (error) {
                logger_1.logger.warn("ヘルスチェック報告オブザーバの呼び出しに失敗しました", {
                    issueId: change.issue.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }
    notifyResolve(issue) {
        for (const observer of Array.from(this.observers)) {
            if (!observer.onResolve) {
                continue;
            }
            try {
                const result = observer.onResolve(issue);
                if (result && typeof result.catch === "function") {
                    result.catch((error) => {
                        logger_1.logger.warn("ヘルスチェック解消オブザーバの処理でエラーが発生しました", {
                            issueId: issue.id,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    });
                }
            }
            catch (error) {
                logger_1.logger.warn("ヘルスチェック解消オブザーバの呼び出しに失敗しました", {
                    issueId: issue.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }
    report(issue) {
        const prev = this.issues.get(issue.id);
        const detectedAt = issue.detectedAt ?? prev?.detectedAt ?? new Date().toISOString();
        const next = {
            id: issue.id,
            level: issue.level,
            message: issue.message,
            detectedAt,
            ...(issue.details !== undefined ? { details: issue.details } : {}),
        };
        this.issues.set(issue.id, next);
        if (!prev) {
            this.notifyReport({
                issue: next,
                context: { previous: null, change: "created" },
            });
            return true;
        }
        const changed = prev.level !== next.level ||
            prev.message !== next.message ||
            prev.detectedAt !== next.detectedAt;
        if (changed) {
            this.notifyReport({
                issue: next,
                context: { previous: prev, change: "updated" },
            });
        }
        return changed;
    }
    resolve(id) {
        const prev = this.issues.get(id);
        if (!prev) {
            return false;
        }
        const deleted = this.issues.delete(id);
        if (deleted) {
            this.notifyResolve(prev);
        }
        return deleted;
    }
    has(id) {
        return this.issues.has(id);
    }
    list() {
        const entries = Array.from(this.issues.values());
        return entries.sort((a, b) => {
            const levelDiff = (levelPriority[a.level] ?? 10) - (levelPriority[b.level] ?? 10);
            if (levelDiff !== 0) {
                return levelDiff;
            }
            return a.detectedAt.localeCompare(b.detectedAt);
        });
    }
}
exports.HealthRegistry = HealthRegistry;
exports.healthRegistry = new HealthRegistry();
//# sourceMappingURL=registry.js.map