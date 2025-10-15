"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeChangedSections = void 0;
const isObject = (value) => typeof value === "object" && value !== null;
const primitiveEqual = (a, b) => a === b;
const deepEqual = (a, b) => {
    if (primitiveEqual(a, b)) {
        return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }
        return a.every((value, index) => deepEqual(value, b[index]));
    }
    if (isObject(a) && isObject(b)) {
        const keysA = Object.keys(a).sort();
        const keysB = Object.keys(b).sort();
        if (keysA.length !== keysB.length) {
            return false;
        }
        return keysA.every((key, index) => {
            const otherKey = keysB[index];
            if (key !== otherKey) {
                return false;
            }
            return deepEqual(a[key], b[key]);
        });
    }
    return false;
};
const computeChangedSections = (previous, next) => {
    const keys = new Set([
        ...Object.keys(previous ?? {}),
        ...Object.keys(next ?? {}),
    ]);
    const changed = [];
    for (const key of keys) {
        if (!deepEqual(previous[key], next[key])) {
            changed.push(key);
        }
    }
    return changed;
};
exports.computeChangedSections = computeChangedSections;
//# sourceMappingURL=diff.js.map