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
import { Link2Off } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { PlusIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirementTestCase } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { useRequirementTestCases } from "@/hooks/store/use-requirement-test-cases";
import { RequirementRelationCollapsible } from "./requirement-relation-collapsible";
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
    <div className="group relative flex min-h-11 w-full items-center gap-3 px-2.5 py-1 transition-colors hover:bg-surface-2">
      {testCase.code && (
        <span className="shrink-0 text-13 text-tertiary tabular-nums">{testCase.code}</span>
      )}
      <Tooltip tooltipContent={testCase.name}>
        <span className="min-w-0 flex-1 truncate text-13 text-primary">{testCase.name}</span>
      </Tooltip>

      {/* 用例库 / 共享库标记 —— 关联列表横跨多个项目，不标出来无法解释来源 */}
      {scopeLabel && <span className="shrink-0 text-13 text-secondary">{scopeLabel}</span>}
      {testCase.module_name && <span className="shrink-0 text-13 text-tertiary">{testCase.module_name}</span>}

      {onUnlink && (
        <Tooltip tooltipContent={t("requirement_detail.test_cases.unlink")}>
          <button
            type="button"
            aria-label={t("requirement_detail.test_cases.unlink")}
            onClick={() => onUnlink(testCase)}
            className="grid size-6 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-secondary"
          >
            <Link2Off className="size-3.5" />
          </button>
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
  /** 外层已有快捷操作条时，空列表不再占一块折叠头 */
  hideWhenEmpty?: boolean;
  /** 外层工具条已经承担新增时，折叠头不再放 + */
  hideAddActions?: boolean;
  linkModalOpen?: boolean;
  onLinkModalOpenChange?: (open: boolean) => void;
};

export const RequirementTestCasesSection = (props: TProps) => {
  const {
    workspaceSlug,
    productId,
    requirementId,
    canManage,
    scopeProjectId,
    hideWhenEmpty = false,
    hideAddActions = false,
    linkModalOpen,
    onLinkModalOpenChange,
  } = props;
  const { t } = useTranslation();
  const { testCases, isLoading, linkTestCases, unlinkTestCase } = useRequirementTestCases({
    workspaceSlug,
    productId,
    requirementId,
  });

  const [localLinkOpen, setLocalLinkOpen] = useState(false);
  const isLinkModalOpen = linkModalOpen ?? localLinkOpen;
  const setIsLinkModalOpen = onLinkModalOpenChange ?? setLocalLinkOpen;
  /** 待确认解除的行；非空即弹确认框，与关联工作项同一交互口径 */
  const [caseToUnlink, setCaseToUnlink] = useState<TRequirementTestCase | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const showList = testCases.length > 0 || !hideWhenEmpty;

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
      {showList && (
        <RequirementRelationCollapsible
          title={t("requirement_detail.test_cases.widget_title")}
          count={testCases.length}
          actions={
            canManage && !hideAddActions ? (
              <button
                type="button"
                aria-label={t("requirement_detail.test_cases.link_existing")}
                title={t("requirement_detail.test_cases.link_existing")}
                onClick={() => setIsLinkModalOpen(true)}
                className="grid size-6 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-secondary"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            ) : undefined
          }
        >
          {isLoading && !testCases.length ? (
            <div className="px-2.5 pb-2.5">
              <Loader className="flex flex-col gap-1.5">
                <Loader.Item height="36px" />
                <Loader.Item height="36px" />
              </Loader>
            </div>
          ) : testCases.length ? (
            <div className="pb-1">
              {testCases.map((testCase) => (
                <RequirementTestCaseRow
                  key={testCase.id}
                  testCase={testCase}
                  onUnlink={canManage ? setCaseToUnlink : undefined}
                />
              ))}
            </div>
          ) : (
            <p className="px-2.5 pb-3 text-13 text-tertiary">{t("requirement_detail.test_cases.empty")}</p>
          )}
        </RequirementRelationCollapsible>
      )}

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
