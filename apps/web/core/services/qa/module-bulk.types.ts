/** 模块批量新建接口（各模块树 .../bulk/）的请求 items：缩进树 */
export type TBulkModuleItem = { name: string; children: TBulkModuleItem[] };

/** 模块批量新建接口的返回：同级已有同名记 exists、本次输入同级重复记 duplicate */
export type TBulkModuleResult = {
  created: number;
  ids: string[];
  skipped: { name: string; reason: "exists" | "duplicate" }[];
};
