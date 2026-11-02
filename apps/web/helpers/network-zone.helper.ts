/**
 * 大网 / 小网隔离（docs/network-zone/plan.md）前端侧的共用判断。
 *
 * 后端在各附件列表项上给 `can_download`；没带（刚上传的单个响应、旧缓存）按可下载处理。
 * 下载被拒时后端返回 403 `{ error: "大网环境不能下载小网上传的文件" }`，各模块把这句直接显示出来。
 */

export type TDownloadable = { can_download?: boolean | null } | null | undefined;

/** 列表项能否下载：只有后端明确给 false 才禁用 */
export const canDownloadFile = (item: TDownloadable): boolean => item?.can_download !== false;

type TErrorLike = {
  error?: string;
  detail?: string;
  message?: string;
  status?: number;
  response?: { status?: number; data?: { error?: string; detail?: string } };
};

/** 下载失败时的展示文案：优先后端的 error（403 时就是「大网环境不能下载…」） */
export const getDownloadErrorMessage = (error: unknown, fallback: string): string => {
  const err = (error ?? {}) as TErrorLike;
  return err.response?.data?.error || err.response?.data?.detail || err.error || err.detail || err.message || fallback;
};

/** 响应头里的被跳过数量（批量打包下载） */
export const readZoneSkippedCount = (headers: Record<string, unknown> | undefined): number => {
  const raw = headers?.["x-zone-skipped"];
  const count = Number(raw ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
};
