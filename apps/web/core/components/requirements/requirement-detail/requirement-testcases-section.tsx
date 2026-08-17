/**
 * 需求详情的「关联测试用例」Section。产品侧整页 / 产品侧抽屉 / 项目侧抽屉三处共用。
 *
 * 与关联工作项的区别：RequirementIssue 挂在 (需求, 项目) 下，那个 Section 必须有确定的
 * 项目语境；用例关联是**需求级**的（用例的 project 来自 repository 且可空，一条需求的
 * 关联用例横跨它进过的所有项目），端点也就落在产品作用域。项目侧靠后端的第二道门
 * （该需求已关联项目的 PROJECT_REQUIREMENT_LINK_*）进来，见
 * apps/api/plane/app/views/requirement/test_case.py 的 _resolve。
 *
 * 项目侧必须传 scopeProjectId 收窄选择器候选池，否则会露出该需求其他项目的用例名。
 *
 * 测试人员那一侧还有第三个入口：用例详情弹窗
 * （components/qa/cases/requirement-display-panel.tsx），写的是同一张表、用 QA 权限。
 *
 * 行上只渲染自解释的字段（编号 / 标题 / 用例库·模块）：用例的 type / priority 是后端
 * IntegerChoices 数值，标签映射在 testhub 路由的 globalEnums 可变单例里，需求详情页先
 * 渲染时那个 map 是空的 —— 详见 requirement-testcase-link-modal.tsx 的说明。
 */
import { useState } from "react";
import { Link2, Link2Off } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirementTestCase } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { useRequirementTestCases } from "@/hooks/store/use-requirement-test-cases";
import { RequirementTestCaseLinkModal } from "./requirement-testcase-link-modal";

/**
 * 关联用例的一行：编号 / 标题 / 用例库·模块 / 解除按钮。
 *
 * 导出以备只读变体复用 —— 两侧的差别只有「能不能解除」，收在 onUnlink 是否传入里，
 * 与 RequirementIssueRow 同一取舍。
 */
export const RequirementTestCaseRow = ({
  testCase,
  onUnlink,
}: {
  testCase: TRequirementTestCase;
  /** 传了才渲染行尾的解除按钮；只读场景不传 */
  onUnlink?: (testCase: TRequirementTestCase) => void;
}) => {
  const { t } = useTranslation();
  const scopeLabel =
    testCase.repository_project_id === null
      ? t("requirement_detail.test_cases.shared_repository")
      : (testCase.repository_name ?? "");

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 text-12">
      {testCase.code && (
        <span className="shrink-0 rounded-sm bg-layer-2 px-1.5 py-0.5 text-11 font-medium text-secondary">
          {testCase.code}
        </span>
      )}
      <Tooltip tooltipContent={testCase.name}>
        <span className="min-w-0 flex-1 truncate text-primary">{testCase.name}</span>
      </Tooltip>

      {/* 用例库 / 共享库标记 —— 关联列表横跨多个项目，不标出来无法解释来源 */}
      {scopeLabel && <span className="shrink-0 text-11 text-secondary">{scopeLabel}</span>}
      {testCase.module_name && <span className="shrink-0 text-11 text-placeholder">{testCase.module_name}</span>}

      {onUnlink && (
        <Tooltip tooltipContent={t("requirement_detail.test_cases.unlink")}>
          <span className="shrink-0">
            <IconButton
              variant="ghost"
              size="sm"
              icon={Link2Off}
              aria-label={t("requirement_detail.test_cases.unlink")}
              onClick={() => onUnlink(testCase)}
            />
          </span>
        </Tooltip>
      )}
    </div>
  );
};

type TProps = {
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  canManage: boolean;
  /**
   * 项目侧抽屉传本项目 id，把选择器的候选池收窄到本项目用例库 + 共享库。
   * 不传（产品侧）则是需求关联的全部项目 —— 产品侧本来就该看到全貌。
   */
  scopeProjectId?: string;
};

export const RequirementTestCasesSection = (props: TProps) => {
  const { workspaceSlug, productId, requirementId, canManage, scopeProjectId } = props;
  const { t } = useTranslation();
  const { testCases, isLoading, linkTestCases, unlinkTestCase } = useRequirementTestCases({
    workspaceSlug,
    productId,
    requirementId,
  });

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  /** 待确认解除的行；非空即弹确认框，与关联工作项同一交互口径 */
  const [caseToUnlink, setCaseToUnlink] = useState<TRequirementTestCase | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  /**
   * 409 冲突要说清是哪条、为什么 —— 「不能关联」不可行动，「这条用例不在本需求的项目
   * 范围里」才可行动（去把需求关联进那个项目，或换共享库的用例）。
   */
  const notifyLinkFailure = (error: unknown) => {
    const payload = error as
      | { code?: string; error?: string; conflicts?: { id?: string; reason?: string }[] }
      | null;
    if (payload?.code === "REQUIREMENT_TEST_CASE_LINK_REJECTED" && payload.conflicts?.length) {
      const reason = payload.conflicts[0].reason;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message:
          reason === "PROJECT_OUT_OF_SCOPE"
            ? t("requirement_detail.test_cases.out_of_scope")
            : t("requirement_detail.test_cases.toast_link_failed"),
      });
      return;
    }
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t("error"),
      message: payload?.error ?? t("requirement_detail.test_cases.toast_link_failed"),
    });
  };

  /** 抛回弹窗 —— 由它决定是否关闭（失败不关，让用户改选） */
  const handleLink = async (caseIds: string[]) => {
    try {
      await linkTestCases(caseIds);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("requirement_detail.test_cases.toast_linked") });
    } catch (error) {
      notifyLinkFailure(error);
      throw error;
    }
  };

  const handleUnlink = async () => {
    if (!caseToUnlink) return;
    setIsUnlinking(true);
    try {
      await unlinkTestCase(caseToUnlink.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("requirement_detail.test_cases.toast_unlinked") });
      setCaseToUnlink(null);
    } catch (error) {
      const payload = error as { error?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("requirement_detail.test_cases.toast_unlink_failed"),
      });
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <>
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-13 font-medium text-primary">{t("requirement_detail.test_cases.section_title")}</span>
          {canManage && (
            <span className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setIsLinkModalOpen(true)}>
                <Link2 className="size-3" />
                {t("requirement_detail.test_cases.link_existing")}
              </Button>
            </span>
          )}
        </div>

        {isLoading && !testCases.length ? (
          <Loader className="flex flex-col gap-1.5">
            <Loader.Item height="32px" />
            <Loader.Item height="32px" />
          </Loader>
        ) : testCases.length ? (
          // 一个外框 + 分隔线，而不是 N 张小卡片 —— 与子需求区、关联工作项区同版式
          <div className="divide-y divide-subtle overflow-hidden rounded-md border border-subtle">
            {testCases.map((testCase) => (
              <RequirementTestCaseRow
                key={testCase.id}
                testCase={testCase}
                onUnlink={canManage ? setCaseToUnlink : undefined}
              />
            ))}
          </div>
        ) : (
          <p className="text-12 text-placeholder">{t("requirement_detail.test_cases.empty")}</p>
        )}
      </section>

      <RequirementTestCaseLinkModal
        isOpen={isLinkModalOpen}
        workspaceSlug={workspaceSlug}
        productId={productId}
        requirementId={requirementId}
        scopeProjectId={scopeProjectId}
        handleClose={() => setIsLinkModalOpen(false)}
        onSubmit={handleLink}
      />

      <AlertModalCore
        isOpen={Boolean(caseToUnlink)}
        isSubmitting={isUnlinking}
        handleClose={() => setCaseToUnlink(null)}
        handleSubmit={() => void handleUnlink()}
        title={t("requirement_detail.test_cases.unlink_confirm_title")}
        content={t("requirement_detail.test_cases.unlink_confirm_description")}
        // AlertModalCore 的按钮默认是英文硬编码，本仓库其余调用点也都显式传
        primaryButtonText={{ default: t("requirement_detail.test_cases.unlink"), loading: t("loading") }}
        secondaryButtonText={t("cancel")}
      />
    </>
  );
};
