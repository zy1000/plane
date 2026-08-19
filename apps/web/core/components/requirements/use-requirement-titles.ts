import { useEffect, useMemo, useRef, useState } from "react";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

type TArgs = {
  workspaceSlug: string;
  /** 检索范围：产品需求传产品，标准库条目传库 —— 父项只会在同一归属内 */
  entityKind: "product" | "library";
  entityId: string;
  /** 当前屏上已有的行，父项多半就在其中 */
  knownRows: { id: string; title: string }[];
  /** 要解析成标题的父项 ID */
  parentIds: (string | null | undefined)[];
  /** 只读当前屏，不再 ids= 去拉活需求。基线快照用：父项标题必须是收录时的，不能漏出今天的名字 */
  skipRemote?: boolean;
};

/**
 * 把父项 ID 解析成标题。
 *
 * 父项存的是 UUID，而网格只有当前这一页的行。先用页内的行兜住绝大多数情况（父子
 * 通常相邻），剩下的跨页父项攒成**一次** `ids=` 批量请求 —— 每个单元格各发一次会
 * 把列表接口打爆。
 *
 * 已请求过的 ID 记在 ref 里，所以翻页/重渲染不会重复拉；解析结果只增不减，翻回
 * 上一页时之前解析过的标题仍然在。
 */
export const useRequirementTitles = ({
  workspaceSlug,
  entityKind,
  entityId,
  knownRows,
  parentIds,
  skipRemote = false,
}: TArgs) => {
  const [fetched, setFetched] = useState<Record<string, string>>({});
  const requestedRef = useRef<Set<string>>(new Set());

  const onScreen = useMemo(
    () => Object.fromEntries(knownRows.map((row) => [row.id, row.title])),
    [knownRows]
  );

  // 拼成字符串再进依赖：parentIds 每次渲染都是新数组，直接用会让 effect 每帧都跑
  const parentIdKey = useMemo(
    () => [...new Set(parentIds.filter((id): id is string => Boolean(id)))].sort().join(","),
    [parentIds]
  );

  useEffect(() => {
    if (skipRemote || !parentIdKey || !entityId || !workspaceSlug) return;
    const missing = parentIdKey
      .split(",")
      .filter((id) => !onScreen[id] && !requestedRef.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => requestedRef.current.add(id));

    const query = { ids: missing, perPage: missing.length };
    const request =
      entityKind === "product"
        ? requirementService.listRequirements(workspaceSlug, entityId, query)
        : requirementService.listLibraryItems(workspaceSlug, entityId, query);
    void request
      .then((response) =>
        setFetched((current) => ({
          ...current,
          ...Object.fromEntries((response?.results ?? []).map((row) => [row.id, row.title])),
        }))
      )
      .catch(() => undefined);
  }, [parentIdKey, onScreen, entityKind, entityId, workspaceSlug, skipRemote]);

  // 页内的行优先：它是最新的，批量请求的结果可能已经过时
  return useMemo(() => ({ ...fetched, ...onScreen }), [fetched, onScreen]);
};
