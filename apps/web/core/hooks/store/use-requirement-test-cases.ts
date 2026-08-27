/**
 * 需求「关联测试用例」section 的局部状态（照 use-requirement-issues 的 SWR 写法，
 * 不进 MobX root store —— 需求域走局部 state，见 docs/domain-glossary.md）。
 *
 * ⚠️ 注意 test-case 域本身是走 root store 的（test-case-activity / test-case-comment），
 * 别被带偏：这个 hook 服务的是需求详情页，跟随需求域的路线。
 *
 * 作用域是 **product**，不是 project —— 用例的 project 来自 repository 且可空
 * （跨项目共享用例库），关联本身是需求级的。
 */
import { useCallback, useMemo } from "react";
import useSWR from "swr";
import type { TRequirementTestCase } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

type TUseRequirementTestCasesProps = {
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  /** section 不可见（抽屉未展开等）时不发请求 */
  enabled?: boolean;
};

/** 关联用例列表的 SWR key。导出理由同 getRequirementIssuesKey：供不展示列表的地方失效缓存 */
export const getRequirementTestCasesKey = (workspaceSlug: string, productId: string, requirementId: string) =>
  `requirement-test-cases-${workspaceSlug}-${productId}-${requirementId}`;

export const useRequirementTestCases = ({
  workspaceSlug,
  productId,
  requirementId,
  enabled = true,
}: TUseRequirementTestCasesProps) => {
  const { data, error, isLoading, mutate } = useSWR(
    enabled && workspaceSlug && productId && requirementId
      ? getRequirementTestCasesKey(workspaceSlug, productId, requirementId)
      : null,
    () => requirementService.listRequirementTestCases(workspaceSlug, productId, requirementId)
  );

  const testCases: TRequirementTestCase[] = useMemo(() => data ?? [], [data]);

  /**
   * 批量关联已有用例。失败往上抛 —— 409 REQUIREMENT_TEST_CASE_LINK_REJECTED 要由调用方
   * 按 conflicts[].reason 差异化提示（「不能关联」不可行动，「这条用例不在本需求的项目范围里」
   * 才可行动）。
   */
  const linkTestCases = useCallback(
    async (caseIds: string[]) => {
      if (!workspaceSlug || !productId || !requirementId || caseIds.length === 0) return;
      await requirementService.linkTestCasesToRequirement(workspaceSlug, productId, requirementId, caseIds);
      await mutate();
    },
    [mutate, productId, requirementId, workspaceSlug]
  );

  /** 解除单条用例关联。失败同样往上抛，由调用方就地提示 */
  const unlinkTestCase = useCallback(
    async (caseId: string) => {
      if (!workspaceSlug || !productId || !requirementId) return;
      await requirementService.unlinkTestCaseFromRequirement(workspaceSlug, productId, requirementId, caseId);
      await mutate();
    },
    [mutate, productId, requirementId, workspaceSlug]
  );

  return {
    testCases,
    isLoading,
    error,
    mutate,
    linkTestCases,
    unlinkTestCase,
  };
};
