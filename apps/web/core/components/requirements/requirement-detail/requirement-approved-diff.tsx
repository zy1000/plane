/**
 * 「当前内容 vs 已通过的那一版」。
 *
 * 变更轨迹只记录**已提交**的变更（变更项是提交那一刻才建的），所以改了三次没提交的人
 * 在系统里找不到任何一处能回答「我到底改了什么」。这个组件填的就是那个空白。
 *
 * 不需要新接口：版本按批准顺序递增写入，`per_page=1` 拿到的第一条就是 approved_version
 * 那一版；当前行本身在结构上已经是一份合法的快照，两边拼成变更项的形状，直接喂给评审页
 * 那个现成的竖排两栏 diff —— 「我改了什么」和「这张单改了什么」本来就该长得一样。
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirement,
  TRequirementBuiltinFieldConfig,
  TRequirementDiffItem,
  TRequirementField,
  TRequirementVersion,
} from "@plane/types";
import { Loader } from "@plane/ui";
import { ChangeRequestRequirementDiff } from "@/components/products/requirements/change/change-request-requirement-diff";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

export const RequirementApprovedDiff = ({
  workspaceSlug,
  productId,
  requirement,
  requirementTypeName,
  fields,
  builtinLayout = null,
}: {
  workspaceSlug: string;
  productId: string;
  requirement: TRequirement;
  requirementTypeName: string;
  fields: TRequirementField[];
  /** 该需求类型的内置字段布局；null 回退现状顺序 */
  builtinLayout?: TRequirementBuiltinFieldConfig[] | null;
}) => {
  const { t } = useTranslation();
  const [approved, setApproved] = useState<TRequirementVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  /**
   * 依赖只能放**稳定**的值。
   *
   * `useTranslation` 每次调用都返回 `store.t.bind(store)`，是一个全新的函数标识；把 t
   * 放进依赖里，配上 effect 内部的 setState，就是一个每渲染一轮打一次请求的死循环。
   * requirement 整个对象同理 —— 这里只认它的 id。
   */
  const requirementId = requirement.id;
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setHasError(false);
    void requirementService
      .listRequirementVersions(workspaceSlug, productId, requirementId, { perPage: 1 })
      .then((response) => {
        if (cancelled) return;
        const latest = response?.results?.[0] ?? null;
        setApproved(latest);
        if (!latest) setHasError(true);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, requirementId, workspaceSlug]);

  // 已通过的那一版是取回来的，当前行是父组件给的 —— 拼装放在渲染期做，不进 effect
  const item = useMemo<TRequirementDiffItem | null>(() => {
    if (!approved) return null;
    return {
      id: approved.id,
      change_type: "update",
      target_id: requirement.id,
      requirement_type_id: requirement.requirement_type_id,
      requirement_type_name: requirementTypeName,
      title: requirement.title,
      before_snapshot: approved.snapshot,
      // 当前行结构上就是一份合法快照（内置列平铺 + data + sort_order）
      proposed_snapshot: requirement,
      base_version: approved.version,
      proposed_sort_order: requirement.sort_order,
    };
  }, [approved, requirement, requirementTypeName]);

  if (isLoading) {
    return (
      <Loader className="flex flex-col gap-2">
        <Loader.Item height="24px" />
        <Loader.Item height="96px" />
      </Loader>
    );
  }

  if (hasError || !item) {
    return <p className="text-12 text-secondary">{t("requirement_detail.approved_diff.unavailable")}</p>;
  }

  return (
    <ChangeRequestRequirementDiff item={item} fields={fields} builtinLayout={builtinLayout} workspaceSlug={workspaceSlug} />
  );
};
