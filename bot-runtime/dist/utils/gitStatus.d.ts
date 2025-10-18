export type GitStatusEntry = {
    path: string;
    status: string;
    originalPath?: string | null;
};
export declare const getGitStatusEntries: (cwd: string) => Promise<GitStatusEntry[]>;
export declare const diffGitStatusEntries: (before: GitStatusEntry[], after: GitStatusEntry[]) => GitStatusEntry[];
//# sourceMappingURL=gitStatus.d.ts.map