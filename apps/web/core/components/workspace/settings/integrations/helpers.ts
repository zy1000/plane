import type {
  TExternalIntegration,
  TExternalIntegrationPersonSyncSummary,
  TExternalIntegrationProjectSyncSummary,
  TExternalIntegrationSyncSummary,
} from "@plane/types";

export const INTEGRATIONS_I18N = "workspace_settings.settings.integrations";

type TTranslate = (key: string, params?: Record<string, unknown>) => string;

/** 前端已知的集成 key / 来源：名称与描述走 i18n；后端新加了集成但前端还没补词条时回落后端文案 */
const CATALOG_KEYS = new Set(["jiandaoyun_project_code", "jiandaoyun_rd_project", "mdm_person_info"]);
const PROVIDER_KEYS = new Set(["jiandaoyun", "mdm"]);
const ERROR_CODES = new Set([
  "INTEGRATION_NOT_FOUND",
  "INTEGRATION_NOT_CONFIGURED",
  "INTEGRATION_SYNC_IN_PROGRESS",
  "INTEGRATION_REMOTE_UNREACHABLE",
  "INTEGRATION_REMOTE_UNAUTHORIZED",
  "INTEGRATION_REMOTE_BAD_RESPONSE",
  "INTEGRATION_TARGET_MISSING",
  "INTEGRATION_INTERNAL_ERROR",
]);

export const getIntegrationName = (integration: TExternalIntegration, t: TTranslate) =>
  CATALOG_KEYS.has(integration.key) ? t(`${INTEGRATIONS_I18N}.catalog.${integration.key}.name`) : integration.name;

export const getIntegrationDescription = (integration: TExternalIntegration, t: TTranslate) =>
  CATALOG_KEYS.has(integration.key)
    ? t(`${INTEGRATIONS_I18N}.catalog.${integration.key}.description`)
    : integration.description;

export const getProviderLabel = (provider: string, t: TTranslate) =>
  PROVIDER_KEYS.has(provider) ? t(`${INTEGRATIONS_I18N}.providers.${provider}`) : provider;

/** 错误码 → 文案；未知码回落 unknown */
export const getIntegrationErrorLabel = (code: string | null | undefined, t: TTranslate) =>
  code && ERROR_CODES.has(code)
    ? t(`${INTEGRATIONS_I18N}.errors.${code}`)
    : t(`${INTEGRATIONS_I18N}.errors.unknown`);

/** service 抛出的后端错误体 `{ error, detail }` → toast 文案 */
export const getIntegrationErrorMessage = (error: unknown, t: TTranslate) => {
  const payload = error && typeof error === "object" ? (error as { error?: unknown; detail?: unknown }) : null;
  const code = typeof payload?.error === "string" ? payload.error : null;
  if (code && ERROR_CODES.has(code)) return getIntegrationErrorLabel(code, t);
  if (typeof payload?.detail === "string" && payload.detail) return payload.detail;
  return getIntegrationErrorLabel(null, t);
};

const isPersonSummary = (summary: TExternalIntegrationSyncSummary): summary is TExternalIntegrationPersonSyncSummary =>
  "users_created" in summary;

/** 人员：「远端 558 条 · 新建账号 12 · 匹配 540 · 加入工作区 30 · 新部门 3 · 上级未解析 5 · 无邮箱 6」，为 0 的尾项不显示 */
const formatPersonSummary = (summary: TExternalIntegrationPersonSyncSummary, t: TTranslate) => {
  const parts = [
    t(`${INTEGRATIONS_I18N}.summary.remote_total`, { count: summary.remote_total }),
    t(`${INTEGRATIONS_I18N}.summary.users_created`, { count: summary.users_created }),
    t(`${INTEGRATIONS_I18N}.summary.users_matched`, { count: summary.users_matched }),
    t(`${INTEGRATIONS_I18N}.summary.members_added`, { count: summary.members_added }),
  ];
  if (summary.departments_created > 0)
    parts.push(t(`${INTEGRATIONS_I18N}.summary.departments_created`, { count: summary.departments_created }));
  if (summary.leaders_unresolved > 0)
    parts.push(t(`${INTEGRATIONS_I18N}.summary.leaders_unresolved`, { count: summary.leaders_unresolved }));
  if (summary.skipped_no_email > 0)
    parts.push(t(`${INTEGRATIONS_I18N}.summary.skipped_no_email`, { count: summary.skipped_no_email }));
  if (summary.skipped_duplicate > 0)
    parts.push(t(`${INTEGRATIONS_I18N}.summary.skipped`, { count: summary.skipped_duplicate }));
  return parts.join(" · ");
};

const isProjectSummary = (summary: TExternalIntegrationSyncSummary): summary is TExternalIntegrationProjectSyncSummary =>
  "unchanged" in summary;

/** 研发项目：「远端 701 条 · 新增 3 · 更新 20 · 未变 678 · 本地改名 2 · 负责人未匹配 65」，为 0 的尾项不显示 */
const formatProjectSummary = (summary: TExternalIntegrationProjectSyncSummary, t: TTranslate) => {
  const parts = [
    t(`${INTEGRATIONS_I18N}.summary.remote_total`, { count: summary.remote_total }),
    t(`${INTEGRATIONS_I18N}.summary.created`, { count: summary.created }),
    t(`${INTEGRATIONS_I18N}.summary.updated`, { count: summary.updated }),
    t(`${INTEGRATIONS_I18N}.summary.unchanged`, { count: summary.unchanged }),
  ];
  const tails = [
    ["local_renamed", summary.local_renamed],
    ["skipped", summary.skipped],
    ["remote_missing", summary.remote_missing],
    ["lead_unmatched", summary.lead_unmatched],
    ["product_manager_unmatched", summary.product_manager_unmatched],
  ] as const;
  for (const [key, count] of tails) {
    if (count > 0) parts.push(t(`${INTEGRATIONS_I18N}.summary.${key}`, { count }));
  }
  return parts.join(" · ");
};

/** 「远端 130 条 · 新增 3 · 已存在 122 · 跳过 4 · 本地多出 2」，为 0 的跳过 / 本地多出不显示 */
export const formatSyncSummary = (summary: TExternalIntegrationSyncSummary, t: TTranslate) => {
  if (isPersonSummary(summary)) return formatPersonSummary(summary, t);
  if (isProjectSummary(summary)) return formatProjectSummary(summary, t);
  const parts = [
    t(`${INTEGRATIONS_I18N}.summary.remote_total`, { count: summary.remote_total }),
    t(`${INTEGRATIONS_I18N}.summary.created`, { count: summary.created }),
    t(`${INTEGRATIONS_I18N}.summary.existing`, { count: summary.existing }),
  ];
  const skipped = summary.skipped_blank + summary.skipped_too_long;
  if (skipped > 0) parts.push(t(`${INTEGRATIONS_I18N}.summary.skipped`, { count: skipped }));
  if (summary.local_only > 0) parts.push(t(`${INTEGRATIONS_I18N}.summary.local_only`, { count: summary.local_only }));
  return parts.join(" · ");
};
