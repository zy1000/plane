/**
 * 第三方集成（工作区设置 → 开发者 → 第三方集成）。
 * 后端 plane/integrations/：每个集成一个 spec，地址 / 密钥来自服务端 env；「上次同步」快照放 Redis，不建表。
 */

export type TExternalIntegrationDirection = "pull" | "push";

export type TExternalIntegrationSyncStatus = "success" | "failed";

export type TExternalIntegrationErrorCode =
  | "INTEGRATION_NOT_FOUND"
  | "INTEGRATION_NOT_CONFIGURED"
  | "INTEGRATION_SYNC_IN_PROGRESS"
  | "INTEGRATION_REMOTE_UNREACHABLE"
  | "INTEGRATION_REMOTE_UNAUTHORIZED"
  | "INTEGRATION_REMOTE_BAD_RESPONSE"
  | "INTEGRATION_TARGET_MISSING"
  | "INTEGRATION_INTERNAL_ERROR";

/** 数据字典型集成一次同步的汇总（只新增，不删除：local_only 只是报告数） */
export type TExternalIntegrationDictionarySyncSummary = {
  remote_total: number;
  unique: number;
  created: number;
  existing: number;
  skipped_blank: number;
  skipped_too_long: number;
  local_only: number;
  pages: number;
};

/** 人员信息集成一次同步的汇总 */
export type TExternalIntegrationPersonSyncSummary = {
  remote_total: number;
  users_created: number;
  users_matched: number;
  members_added: number;
  departments_created: number;
  leaders_unresolved: number;
  skipped_no_email: number;
  skipped_duplicate: number;
};

export type TExternalIntegrationSyncSummary =
  | TExternalIntegrationDictionarySyncSummary
  | TExternalIntegrationPersonSyncSummary;

export type TExternalIntegrationSyncSnapshot = {
  status: TExternalIntegrationSyncStatus;
  finished_at: string;
  duration_ms: number;
  /** null = 定时任务触发 */
  triggered_by: { id: string; display_name: string } | null;
  summary: TExternalIntegrationSyncSummary | null;
  error: { code: string; detail: string } | null;
};

export type TExternalIntegrationDictionaryTarget = {
  kind: "dictionary";
  dictionary_key: string;
  dictionary_id: string | null;
  /** 读 DB 行：用户可能改过名，或系统字典带了「（key）」后缀 */
  dictionary_name: string | null;
  item_count: number;
};

export type TExternalIntegrationWorkspaceMembersTarget = {
  kind: "workspace_members";
  member_count: number;
  /** 带工号的成员数 */
  synced_count: number;
};

export type TExternalIntegrationTarget = TExternalIntegrationDictionaryTarget | TExternalIntegrationWorkspaceMembersTarget;

export type TExternalIntegration = {
  key: string;
  /** 后端给的中文兜底；前端已知的 key 走 i18n */
  name: string;
  provider: string;
  direction: TExternalIntegrationDirection;
  description: string;
  target: TExternalIntegrationTarget | null;
  /** 远端表单 / 字段标识（如 field / app_id / entry_id），不含密钥 */
  remote: Record<string, string> | null;
  is_configured: boolean;
  /** 缺失的服务端环境变量名，原样展示给运维 */
  missing_settings: string[];
  last_sync: TExternalIntegrationSyncSnapshot | null;
};

export type TExternalIntegrationSyncResponse = {
  integration: TExternalIntegration;
  result: TExternalIntegrationSyncSnapshot;
};

/** sync 失败时后端的错误体（service 原样抛出）；带回更新后的 integration 以便就地刷新卡片 */
export type TExternalIntegrationSyncError = {
  error: TExternalIntegrationErrorCode | string;
  detail?: string;
  missing_settings?: string[];
  integration?: TExternalIntegration;
};
