"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTaskMetadata = exports.validateTask = exports.deleteTaskFile = exports.listTaskFiles = exports.readTaskFile = exports.ensureInboxDirectory = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const js_yaml_1 = require("js-yaml");
const paths_1 = require("./paths");
const FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const PRIORITY_LABELS = {
    low: "低",
    normal: "通常",
    high: "高",
};
const SUMMARY_PLACEHOLDER = "(概要未入力)";
const DETAILS_PLACEHOLDER = "(詳細未入力)";
const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);
const buildEmptyMetadata = (title = "件名未設定") => ({
    title,
    priority: "normal",
    priority_label: null,
    summary: null,
    created_at: null,
    author: null,
    channel_id: null,
    interaction_id: null,
});
const parsePriority = (value) => {
    if (value === "low" || value === "normal" || value === "high") {
        return value;
    }
    return "normal";
};
const parseNullableString = (value) => {
    return typeof value === "string" && value.length > 0 ? value : null;
};
const parseAuthor = (value) => {
    if (!value || typeof value !== "object") {
        return null;
    }
    const record = value;
    const id = parseNullableString(record.id);
    const tag = parseNullableString(record.tag);
    if (!id && !tag) {
        return null;
    }
    return { id: id ?? null, tag: tag ?? null };
};
const parseMetadata = (value) => {
    if (!value || typeof value !== "object") {
        return buildEmptyMetadata();
    }
    const record = value;
    const priority = parsePriority(record.priority);
    const priorityLabel = parseNullableString(record.priority_label);
    const summary = parseNullableString(record.summary);
    const createdAt = parseNullableString(record.created_at);
    const channelId = parseNullableString(record.channel_id);
    const interactionId = parseNullableString(record.interaction_id);
    const title = typeof record.title === "string" && record.title.length > 0 ? record.title : "件名未設定";
    const base = buildEmptyMetadata(title);
    return {
        ...base,
        priority,
        priority_label: priorityLabel,
        summary,
        created_at: createdAt,
        author: parseAuthor(record.author),
        channel_id: channelId,
        interaction_id: interactionId,
    };
};
const ensureInboxDirectory = async () => {
    await fs_1.promises.mkdir(paths_1.INBOX_DIR, { recursive: true });
};
exports.ensureInboxDirectory = ensureInboxDirectory;
const resolveFilePath = (filename) => {
    if (filename.includes("/") || filename.includes("\\")) {
        throw new Error("ファイル名にはパス区切り文字を含められません。");
    }
    return path_1.default.join(paths_1.INBOX_DIR, filename);
};
const readTaskFile = async (filename) => {
    await (0, exports.ensureInboxDirectory)();
    const filePath = resolveFilePath(filename);
    const raw = await fs_1.promises.readFile(filePath, "utf-8");
    const match = raw.match(FRONT_MATTER_PATTERN);
    if (!match) {
        throw new Error("タスクファイルのフロントマターを解析できませんでした。");
    }
    const [, frontMatter, body] = match;
    const frontMatterContent = frontMatter ?? "";
    const parsedFrontMatter = frontMatterContent.length > 0 ? (0, js_yaml_1.load)(frontMatterContent) : undefined;
    const metadata = parseMetadata(parsedFrontMatter);
    return {
        filename,
        filePath,
        metadata,
        body: (body ?? "").trim(),
    };
};
exports.readTaskFile = readTaskFile;
const listTaskFiles = async () => {
    await (0, exports.ensureInboxDirectory)();
    const entries = await fs_1.promises.readdir(paths_1.INBOX_DIR);
    const markdownFiles = entries.filter((entry) => entry.endsWith(".md"));
    const tasks = await Promise.all(markdownFiles.map(async (filename) => {
        try {
            return await (0, exports.readTaskFile)(filename);
        }
        catch (error) {
            return {
                filename,
                filePath: resolveFilePath(filename),
                metadata: buildEmptyMetadata(filename),
                body: "",
            };
        }
    }));
    return tasks.sort((a, b) => {
        const createdA = a.metadata.created_at ?? "";
        const createdB = b.metadata.created_at ?? "";
        if (createdA && createdB) {
            return createdB.localeCompare(createdA);
        }
        return a.filename.localeCompare(b.filename);
    });
};
exports.listTaskFiles = listTaskFiles;
const deleteTaskFile = async (filename) => {
    await (0, exports.ensureInboxDirectory)();
    const filePath = resolveFilePath(filename);
    await fs_1.promises.unlink(filePath);
};
exports.deleteTaskFile = deleteTaskFile;
const normalizeLineEndings = (value) => value.replace(/\r\n/g, "\n");
const SECTION_HEADER_PATTERN = /^##\s+(.+?)\s*$/;
const parseTaskBodySections = (body) => {
    const lines = normalizeLineEndings(body).split("\n");
    const sections = {};
    let current = null;
    let buffer = [];
    const flush = () => {
        if (current) {
            sections[current] = buffer;
        }
        buffer = [];
    };
    for (const line of lines) {
        const header = line.match(SECTION_HEADER_PATTERN);
        if (header) {
            flush();
            const sectionName = header[1]?.trim() ?? null;
            current = sectionName && sectionName.length > 0 ? sectionName : null;
            continue;
        }
        if (line.trim() === "---") {
            flush();
            current = null;
            continue;
        }
        if (current) {
            buffer.push(line);
        }
    }
    flush();
    const overviewLines = sections["概要"] ?? [];
    const detailsLines = sections["詳細"] ?? [];
    return {
        overview: overviewLines.join("\n").trim() || null,
        details: detailsLines.join("\n").trim() || null,
    };
};
const normalizeNullableInput = (value) => {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
const assertPriority = (value) => {
    if (value === "low" || value === "normal" || value === "high") {
        return value;
    }
    throw new Error("優先度は low / normal / high のいずれかを指定してください。");
};
const ensureSummaryLength = (value) => {
    const length = value.trim().length;
    if (length < 5 || length > 500) {
        throw new Error("summary は 5〜500 文字で指定してください。");
    }
};
const validateTask = (task) => {
    const issues = [];
    const { metadata, body } = task;
    const sections = parseTaskBodySections(body);
    const title = metadata.title.trim();
    if (title.length < 3) {
        issues.push({
            level: "error",
            field: "title",
            message: "タイトルが短すぎます（3文字以上で入力してください）。",
        });
    }
    if (title.length > 150) {
        issues.push({
            level: "warning",
            field: "title",
            message: "タイトルが長すぎます（150文字以内に収めてください）。",
        });
    }
    const summary = metadata.summary?.trim() ?? "";
    if (summary.length === 0) {
        issues.push({
            level: "warning",
            field: "summary",
            message: "front matter の summary が未設定です。",
        });
    }
    else if (summary.length < 5 || summary.length > 500) {
        issues.push({
            level: "warning",
            field: "summary",
            message: "front matter の summary が制限（5〜500文字）を満たしていません。",
        });
    }
    if (!sections.overview) {
        issues.push({
            level: "error",
            field: "body.overview",
            message: "本文に `## 概要` セクションが見つかりません。",
        });
    }
    else if (sections.overview.trim() === SUMMARY_PLACEHOLDER) {
        issues.push({
            level: "warning",
            field: "body.overview",
            message: "概要セクションがプレースホルダーのままです。",
        });
    }
    else if (sections.overview.trim().length < 5) {
        issues.push({
            level: "warning",
            field: "body.overview",
            message: "概要セクションの内容が短すぎます（5文字以上推奨）。",
        });
    }
    if (!sections.details) {
        issues.push({
            level: "error",
            field: "body.details",
            message: "本文に `## 詳細` セクションが見つかりません。",
        });
    }
    else if (sections.details.trim() === DETAILS_PLACEHOLDER) {
        issues.push({
            level: "warning",
            field: "body.details",
            message: "詳細セクションがプレースホルダーのままです。",
        });
    }
    else if (sections.details.trim().length < 10) {
        issues.push({
            level: "warning",
            field: "body.details",
            message: "詳細セクションの内容が短すぎます（10文字以上推奨）。",
        });
    }
    if (!metadata.created_at) {
        issues.push({
            level: "warning",
            field: "created_at",
            message: "作成日時が記録されていません。",
        });
    }
    else if (Number.isNaN(Date.parse(metadata.created_at))) {
        issues.push({
            level: "error",
            field: "created_at",
            message: "作成日時が ISO 8601 形式ではありません。",
        });
    }
    if (!metadata.author) {
        issues.push({
            level: "warning",
            field: "author",
            message: "依頼者情報（author）が未設定です。",
        });
    }
    else {
        if (!metadata.author.id) {
            issues.push({
                level: "warning",
                field: "author.id",
                message: "依頼者 ID が記録されていません。",
            });
        }
        if (!metadata.author.tag) {
            issues.push({
                level: "warning",
                field: "author.tag",
                message: "依頼者タグが記録されていません。",
            });
        }
    }
    if (!PRIORITY_LABELS[metadata.priority]) {
        issues.push({
            level: "error",
            field: "priority",
            message: "優先度に不正な値が指定されています。",
        });
    }
    if (metadata.summary === null && sections.overview && sections.overview.trim().length > 0) {
        issues.push({
            level: "warning",
            field: "summary",
            message: "概要セクションは存在しますが、front matter の summary が未設定です。",
        });
    }
    return issues;
};
exports.validateTask = validateTask;
const updateTaskMetadata = async (filename, updates) => {
    const hasUpdates = typeof updates.title === "string" ||
        typeof updates.priority === "string" ||
        hasOwn(updates, "summary") ||
        updates.summaryFromBody === true ||
        hasOwn(updates, "createdAt") ||
        hasOwn(updates, "authorId") ||
        hasOwn(updates, "authorTag") ||
        hasOwn(updates, "channelId") ||
        hasOwn(updates, "interactionId");
    if (!hasUpdates) {
        throw new Error("更新する項目が指定されていません。");
    }
    await (0, exports.ensureInboxDirectory)();
    const filePath = resolveFilePath(filename);
    const raw = await fs_1.promises.readFile(filePath, "utf-8");
    const match = raw.match(FRONT_MATTER_PATTERN);
    if (!match) {
        throw new Error("タスクファイルのフロントマターを解析できませんでした。");
    }
    const [, frontMatter, bodyRaw] = match;
    const frontMatterContent = frontMatter ?? "";
    const parsedFrontMatter = frontMatterContent.length > 0 ? (0, js_yaml_1.load)(frontMatterContent) : undefined;
    const metadata = parseMetadata(parsedFrontMatter);
    const newMetadata = {
        ...metadata,
        author: metadata.author ? { ...metadata.author } : null,
    };
    if (typeof updates.title === "string") {
        const trimmed = updates.title.trim();
        if (trimmed.length < 3 || trimmed.length > 150) {
            throw new Error("タイトルは 3〜150 文字で指定してください。");
        }
        newMetadata.title = trimmed;
    }
    if (typeof updates.priority === "string") {
        newMetadata.priority = assertPriority(updates.priority);
    }
    let summarySyncedFromBody = false;
    if (hasOwn(updates, "summary")) {
        const summaryInputRaw = normalizeNullableInput(updates.summary);
        if (typeof summaryInputRaw === "string") {
            const normalizedSummary = summaryInputRaw.replace(/\s+/g, " ").trim();
            ensureSummaryLength(normalizedSummary);
            newMetadata.summary = normalizedSummary;
        }
        else {
            newMetadata.summary = null;
        }
    }
    else if (updates.summaryFromBody) {
        const sections = parseTaskBodySections(bodyRaw ?? "");
        const overview = sections.overview?.trim() ?? "";
        if (overview.length === 0) {
            throw new Error("本文に有効な概要セクションがないため、summary を同期できません。");
        }
        if (overview === SUMMARY_PLACEHOLDER) {
            throw new Error("概要セクションがプレースホルダーのため、summary を同期できません。");
        }
        ensureSummaryLength(overview);
        newMetadata.summary = overview.replace(/\s+/g, " ").trim();
        summarySyncedFromBody = true;
    }
    if (hasOwn(updates, "createdAt")) {
        const createdAtInput = normalizeNullableInput(updates.createdAt);
        if (typeof createdAtInput === "string") {
            if (Number.isNaN(Date.parse(createdAtInput))) {
                throw new Error("created_at には ISO 8601 形式の日時を指定してください。");
            }
            newMetadata.created_at = createdAtInput;
        }
        else {
            newMetadata.created_at = null;
        }
    }
    if (hasOwn(updates, "authorId") || hasOwn(updates, "authorTag")) {
        const authorId = normalizeNullableInput(hasOwn(updates, "authorId") ? updates.authorId : newMetadata.author?.id ?? null);
        const authorTag = normalizeNullableInput(hasOwn(updates, "authorTag") ? updates.authorTag : newMetadata.author?.tag ?? null);
        if (!authorId && !authorTag) {
            newMetadata.author = null;
        }
        else {
            newMetadata.author = {
                id: (authorId ?? null),
                tag: (authorTag ?? null),
            };
        }
    }
    if (hasOwn(updates, "channelId")) {
        const channelId = normalizeNullableInput(updates.channelId);
        newMetadata.channel_id = channelId ?? null;
    }
    if (hasOwn(updates, "interactionId")) {
        const interactionId = normalizeNullableInput(updates.interactionId);
        newMetadata.interaction_id = interactionId ?? null;
    }
    newMetadata.priority_label = PRIORITY_LABELS[newMetadata.priority] ?? newMetadata.priority;
    const metadataChanged = JSON.stringify(metadata) !== JSON.stringify(newMetadata);
    if (!metadataChanged) {
        throw new Error("指定内容によるメタデータの変更がありませんでした。");
    }
    const updatedFrontMatter = (0, js_yaml_1.dump)(newMetadata, { lineWidth: 120 }).trimEnd();
    const body = bodyRaw ?? "";
    const separator = body.startsWith("\n") ? "" : "\n";
    let newContent = `---\n${updatedFrontMatter}\n---${separator}${body}`;
    if (!newContent.endsWith("\n")) {
        newContent += "\n";
    }
    await fs_1.promises.writeFile(filePath, newContent, "utf-8");
    const task = await (0, exports.readTaskFile)(filename);
    return {
        task,
        summarySyncedFromBody,
    };
};
exports.updateTaskMetadata = updateTaskMetadata;
//# sourceMappingURL=inbox.js.map