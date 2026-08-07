import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  TRequirement,
  TRequirementBuiltinValues,
  TRequirementTrailEntry,
  TRequirementData,
} from "@plane/types";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { pickBuiltinValues } from "@/components/requirements/requirement-builtin-fields";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/** 后端乐观锁冲突的 code，见 apps/api/plane/app/views/requirement/row_base.py */
const VERSION_CONFLICT_CODE = "REQUIREMENT_VERSION_CONFLICT";

const isVersionConflict = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === VERSION_CONFLICT_CODE;

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
  const { t } = useTranslation();
  const [fetched, setFetched] = useState<TRequirement | null>(null);
  const [children, setChildren] = useState<TRequirement[]>([]);
  const [trail, setTrail] = useState<TRequirementTrailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // seed 只是初值，之后以本地状态为准 —— 抽屉里改一个字段不该被上层的旧行覆盖回去
  const requirement = fetched ?? seed ?? null;
  const canQuery = Boolean(workspaceSlug && productId && requirementId);

  /**
   * 提交时读 ref 而不是闭包里的 requirement。
   *
   * 闭包捕获的是发起那一帧的快照，两次提交挨得近时会带着同一个 version 出门，
   * 后端严格比较 version 后把第二个打成 409。ref 保证永远读到最新一行。
   */
  const requirementRef = useRef<TRequirement | null>(requirement);
  requirementRef.current = requirement;

  const applyRow = useCallback((row: TRequirement) => {
    requirementRef.current = row;
    setFetched(row);
  }, []);

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

  /** 单独取一行，供版本冲突后重放用（后端没有 retrieve，走列表的 ?ids=） */
  const fetchRow = useCallback(
    async (id: string) => {
      const response = await requirementService.listRequirements(workspaceSlug, productId, { ids: [id], perPage: 1 });
      return response?.results?.[0] ?? null;
    },
    [productId, workspaceSlug]
  );

  /**
   * 真正发一次 PATCH。
   *
   * 内置列整组传 —— 后端按缺省值补齐没传的列，只传改动的那个等于把其余七列清空。
   * 撞上乐观锁就重取最新行、把这次改动重放到新版本上再发一次；只重放一次，
   * 连续冲突说明是真的多端并发，交给调用方处理。
   */
  const sendPatch = useCallback(
    async (patch: { builtin?: Partial<TRequirementBuiltinValues>; data?: TRequirementData }) => {
      const current = requirementRef.current;
      if (!workspaceSlug || !productId || !current) return null;

      const payloadFor = (row: TRequirement) => ({
        data: patch.data ?? row.data,
        builtin: { ...pickBuiltinValues(row), ...(patch.builtin ?? {}) },
        version: row.version,
      });

      try {
        const response = await requirementService.updateRequirement(
          workspaceSlug,
          productId,
          current.id,
          payloadFor(current)
        );
        applyRow(response);
        return response;
      } catch (error) {
        // in_review 之类的 409 是业务闸门，重放没有意义，只有版本冲突才重试
        if (!isVersionConflict(error)) throw error;
        const latest = await fetchRow(current.id);
        if (!latest) throw error;
        applyRow(latest);
        const replayed = await requirementService.updateRequirement(
          workspaceSlug,
          productId,
          latest.id,
          payloadFor(latest)
        );
        applyRow(replayed);
        return replayed;
      }
    },
    [applyRow, fetchRow, productId, workspaceSlug]
  );

  /**
   * 提交排队：同一时刻只允许一个 PATCH 在飞。
   *
   * 后端每次写入都会 version += 1 且严格比较，所以并发提交必然自撞。排队后
   * 后一个提交发出时前一个的响应已经落进 ref，version 天然是连续的。
   */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const submitPatch = useCallback(
    (patch: { builtin?: Partial<TRequirementBuiltinValues>; data?: TRequirementData }) => {
      const next = queueRef.current.then(
        () => sendPatch(patch),
        () => sendPatch(patch)
      );
      // 调用方一律 void 掉返回值，失败必须在这里说出来，否则改动悄无声息地丢了
      queueRef.current = next.catch((error: unknown) => {
        const payload = error as { error?: string } | null;
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: payload?.error ?? t("workspace_products.requirements.toast.failed"),
        });
      });
      return queueRef.current;
    },
    [sendPatch, t]
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
