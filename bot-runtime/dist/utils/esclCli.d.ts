export type EsclFileResult = {
    filename: string;
    buffer: Buffer;
};
export declare const runEsclCsv: (parentUrl: string, group?: string | null) => Promise<EsclFileResult>;
export declare const runEsclXlsx: (parentUrl: string, group?: string | null) => Promise<EsclFileResult>;
export declare const runEsclVersion: () => Promise<string>;
//# sourceMappingURL=esclCli.d.ts.map