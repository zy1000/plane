/**
 * 明细 diff 的筛选状态：模板视图 + 分段筛选（全部/新增/修改/删除）+「仅显示变化列」开关。
 *
 * 三者都写进 URL query，翻页与刷新后保留；模板与分段值同时作为 template_id / change_type
 * 传给服务端分页端点，所以千行明细下筛选不会退化成前端过滤。
 */
import { useCallback } from "react";
import { useSearchParams } from "react-router";
import type { TRequirementChangeType } from "@plane/types";

const CHANGE_TYPES: TRequirementChangeType[] = ["create", "update", "delete"];

const QUERY_CHANGE_TYPE = "diff";
const QUERY_ALL_COLUMNS = "cols";
const QUERY_TEMPLATE = "tpl";

export const useChangeItemFilters = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(QUERY_CHANGE_TYPE) as TRequirementChangeType | null;
  const changeType = requested && CHANGE_TYPES.includes(requested) ? requested : undefined;
  // 默认开「仅显示变化列」，所以 URL 上出现 cols=all 才展开全部列
  const changedColumnsOnly = searchParams.get(QUERY_ALL_COLUMNS) !== "all";
  // 合法性交给调用方校验：可选模板来自变更单详情，这个 hook 拿不到
  const requestedTemplateId = searchParams.get(QUERY_TEMPLATE) ?? undefined;

  const patchQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null) next.delete(key);
        else next.set(key, value);
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const setChangeType = useCallback(
    (value: TRequirementChangeType | undefined) => patchQuery({ [QUERY_CHANGE_TYPE]: value ?? null }),
    [patchQuery]
  );

  const setChangedColumnsOnly = useCallback(
    (value: boolean) => patchQuery({ [QUERY_ALL_COLUMNS]: value ? null : "all" }),
    [patchQuery]
  );

  const setTemplateId = useCallback(
    (value: string | undefined) => patchQuery({ [QUERY_TEMPLATE]: value ?? null }),
    [patchQuery]
  );

  return {
    changeType,
    changedColumnsOnly,
    requestedTemplateId,
    setChangeType,
    setChangedColumnsOnly,
    setTemplateId,
  };
};
