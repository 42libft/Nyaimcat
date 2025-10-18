import { type DiscordActions } from "../codex/discordActions";
import { recordHealthIssueReport, recordHealthIssueResolution } from "./history";
type PublishMessageArgs = Parameters<DiscordActions["publishMessage"]>;
type DiscordActionsLike = {
    publishMessage: (...args: PublishMessageArgs) => Promise<unknown>;
};
type DiscordActionsFactory = () => DiscordActionsLike;
export declare const initializeHealthAlerts: () => () => void;
/**
 * テスト専用: DiscordActions の生成を差し替えます。
 */
export declare const __setDiscordActionsFactoryForTesting: (factory: DiscordActionsFactory | null) => void;
/**
 * テスト専用: ヘルス履歴記録処理を差し替えます。
 */
export declare const __setHealthHistoryRecordersForTesting: (overrides: {
    recordReport?: typeof recordHealthIssueReport;
    recordResolution?: typeof recordHealthIssueResolution;
}) => void;
/**
 * テスト専用: 内部状態と差し替えを初期化します。
 */
export declare const __resetHealthAlertsTestingState: () => void;
export {};
//# sourceMappingURL=alerts.d.ts.map