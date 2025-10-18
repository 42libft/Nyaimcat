export type TaskPriority = "low" | "normal" | "high";
export type TaskMetadata = {
    title: string;
    priority: TaskPriority;
    priority_label: string | null;
    summary: string | null;
    created_at: string | null;
    author: {
        id: string | null;
        tag: string | null;
    } | null;
    channel_id: string | null;
    interaction_id: string | null;
};
export type TaskFile = {
    filename: string;
    filePath: string;
    metadata: TaskMetadata;
    body: string;
};
export declare const ensureInboxDirectory: () => Promise<void>;
export declare const readTaskFile: (filename: string) => Promise<TaskFile>;
export declare const listTaskFiles: () => Promise<TaskFile[]>;
export declare const deleteTaskFile: (filename: string) => Promise<void>;
export type TaskValidationLevel = "error" | "warning";
export type TaskValidationIssue = {
    level: TaskValidationLevel;
    message: string;
    field?: string;
};
export declare const validateTask: (task: TaskFile) => TaskValidationIssue[];
export type TaskMetadataUpdateOptions = {
    title?: string;
    priority?: TaskPriority;
    summary?: string | null;
    summaryFromBody?: boolean;
    createdAt?: string | null;
    authorId?: string | null;
    authorTag?: string | null;
    channelId?: string | null;
    interactionId?: string | null;
};
export type TaskMetadataUpdateResult = {
    task: TaskFile;
    summarySyncedFromBody: boolean;
};
export declare const updateTaskMetadata: (filename: string, updates: TaskMetadataUpdateOptions) => Promise<TaskMetadataUpdateResult>;
//# sourceMappingURL=inbox.d.ts.map