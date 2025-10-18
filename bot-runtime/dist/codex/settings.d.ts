export declare const parseBooleanSetting: (value: string | undefined, defaultValue: boolean) => boolean;
export declare const isDocsUpdateEnabledByDefault: (env?: NodeJS.ProcessEnv) => boolean;
export type LongRunNotificationConfig = {
    enabled: boolean;
    initialDelayMs: number;
    intervalMs: number | null;
    maxNotifications: number | null;
};
export declare const getLongRunNotificationConfig: (env?: NodeJS.ProcessEnv) => LongRunNotificationConfig;
//# sourceMappingURL=settings.d.ts.map