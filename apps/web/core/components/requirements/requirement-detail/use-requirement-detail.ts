import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TRequirement,
  TRequirementBuiltinValues,
  TRequirementTrailEntry,
  TRequirementData,
} from "@plane/types";
import { pickBuiltinValues } from "@/components/requirements/requirement-builtin-fields";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/** 变更轨迹一次取满：单条需求被改的次数是个位数量级，分页只会多一次交互 */
const TRAIL_PAGE_SIZE = 50;
/** 子需求同理 —— 真要到几十条，说明拆得有问题，那时再加分页 */
const CHILDREN_PAGE_SIZE = 50;

type TArgs = {
  workspaceSlug: string;
  productId: string;
  requirementId: string | null;
  /**
   * 网格里已经有这一行时直接传进来，省掉一次请求。
   * 整页路由（深链、刷新）拿不到，留空即可。
   */
  seed?: TRequirement | null;
};

/**
 * 一条需求的详情数据。
 *
 * 后端没有 retrieve 端点，取单行走列表的 `?ids=` —— 这是它自带的用法，草稿层与
 * 作用域解析都由列表那条链路统一处理，比另开一个 retrieve 少一处分叉。
 */
export const useRequirementDetail = ({ workspaceSlug, productId, requirementId, seed }: TArgs) => {
  const [fetched, setFetched] = useState<TRequirement | null>(null);
  const [children, setChildren] = useState<TRequirement[]>([]);
  const [trail, setTrail] = useState<TRequirementTrailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // seed 只是初值，之后以本地状态为准 —— 抽屉里改一个字段不该被上层的旧行覆盖回去
  const requirement = fetched ?? seed ?? null;
  const canQuery = Boolean(workspaceSlug && productId && requirementId);

  const loadRequirement = useCallback(async () => {
    if (!canQuery || !requirementId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listRequirements(workspaceSlug, productId, {
        ids: [requirementId],
        perPage: 1,
      });
      const row = response?.results?.[0] ?? null;
      setFetched(row);
      if (!row) setError("Requirement not found.");
    } catch {
      setError("Unable to load this requirement.");
    } finally {
      setIsLoading(false);
    }
  }, [canQuery, productId, requirementId, workspaceSlug]);

  const loadChildren = useCallback(async () => {
    if (!canQuery || !requirementId) return;
    try {
      const response = await requirementService.listRequirements(workspaceSlug, productId, {
        // parent_id 是可筛选的内置列，子需求不需要额外的后端支持
        filters: [{ field_id: "parent_id", operator: "equals", value: requirementId }],
        perPage: CHILDREN_PAGE_SIZE,
      });
      setChildren(response?.results ?? []);
    } catch {
      setChildren([]);
    }
  }, [canQuery, productId, requirementId, workspaceSlug]);

  const loadTrail = useCallback(async () => {
    if (!canQuery || !requirementId) return;
    try {
      const response = await requirementService.listRequirementTrail(workspaceSlug, productId, requirementId, {
        perPage: TRAIL_PAGE_SIZE,
      });
      setTrail(response?.results ?? []);
    } catch {
      // 变更轨迹是附加信息，取不到就空着，不该把整个详情打成错误态
      setTrail([]);
    }
  }, [canQuery, productId, requirementId, workspaceSlug]);

  // 换一条需求时先清干净，否则新行渲染出来之前会闪一下上一条的子需求与轨迹
  useEffect(() => {
    setFetched(null);
    setChildren([]);
    setTrail([]);
    setError(null);
  }, [requirementId]);

  useEffect(() => {
    if (!canQuery) return;
    // seed 已经给了完整一行，只有整页深链才需要真的去取
    if (!seed) void loadRequirement();
    void loadChildren();
    void loadTrail();
  }, [canQuery, loadChildren, loadRequirement, loadTrail, seed]);

  /**
   * 提交一次修改。
   *
   * 内置列整组传 —— 后端按缺省值补齐没传的列，只传改动的那个等于把其余七列清空。
   */
  const submitPatch = useCallback(
    async (patch: { builtin?: Partial<TRequirementBuiltinValues>; data?: TRequirementData }) => {
      if (!workspaceSlug || !productId || !requirement) return null;
      const response = await requirementService.updateRequirement(workspaceSlug, productId, requirement.id, {
        data: patch.data ?? requirement.data,
        builtin: { ...pickBuiltinValues(requirement), ...(patch.builtin ?? {}) },
        version: requirement.version,
      });
      setFetched(response);
      return response;
    },
    [productId, requirement, workspaceSlug]
  );

  const parentIds = useMemo(() => [requirement?.parent_id], [requirement?.parent_id]);

  return {
    requirement,
    children,
    trail,
    isLoading: isLoading && !requirement,
    error,
    parentIds,
    submitPatch,
    refresh: loadRequirement,
    refreshTrail: loadTrail,
  };
};
