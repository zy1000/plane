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

/** 研发项目集成一次同步的汇总；details 里每类明细最多 100 条 */
export type TExternalIntegrationProjectSyncSummary = {
  remote_total: number;
  created: number;
  updated: number;
  unchanged: number;
  /** 本地未绑定的项目和远端撞名，被加了「（本地）」后缀 */
  local_renamed: number;
  skipped: number;
  /** 本地已同步、远端已删除（本地不删） */
  remote_missing: number;
  lead_unmatched: number;
  product_manager_unmatched: number;
  dictionary_added: { business_unit: string[]; project_code: string[] };
  details: {
    local_renamed: { from: string; to: string }[];
    skipped: { name: string; identifier: string; reason: string }[];
    remote_missing: string[];
    unmatched_people: { employee_id: string; name: string; lead: number; product_manager: number }[];
    unmatched_values: Record<string, string[]>;
  };
  pages: number;
};

export type TExternalIntegrationSyncSummary =
  | TExternalIntegrationDictionarySyncSummary
  | TExternalIntegrationPersonSyncSummary
  | TExternalIntegrationProjectSyncSummary;

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

export type TExternalIntegrationProjectsTarget = {
  kind: "projects";
  /** 本工作区已和远端绑定的项目数 */
  synced_count: number;
};

export type TExternalIntegrationTarget =
  | TExternalIntegrationDictionaryTarget
  | TExternalIntegrationWorkspaceMembersTarget
  | TExternalIntegrationProjectsTarget;

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
  /** true = 「立即同步」投后台执行，接口 202 返回，前端轮询 is_running */
  run_async: boolean;
  /** 正在同步（手动或定时）；后台执行的集成靠它轮询 */
  is_running: boolean;
};

export type TExternalIntegrationSyncResponse = {
  integration: TExternalIntegration;
  /** 后台执行的集成为 null：结果稍后出现在 integration.last_sync */
  result: TExternalIntegrationSyncSnapshot | null;
};

/** sync 失败时后端的错误体（service 原样抛出）；带回更新后的 integration 以便就地刷新卡片 */
export type TExternalIntegrationSyncError = {
  error: TExternalIntegrationErrorCode | string;
  detail?: string;
  missing_settings?: string[];
  integration?: TExternalIntegration;
};
