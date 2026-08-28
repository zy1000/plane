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
 * 行几何对齐工作项详情的用例绑定：左缩进 + 箭头占位，标题可点开详情，属性收在右侧胶囊。
 * 用例的 type / priority 是后端 IntegerChoices 数值，标签映射在 testhub 的 globalEnums
 * 里，需求页先渲染时那个 map 是空的 —— 详见 requirement-testcase-link-modal.tsx。
 */
import { useEffect, useState } from "react";
import { CalendarDays, FlaskConical, Link2Off } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirementTestCase } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import UpdateModal from "@/components/qa/cases/update-modal";
import { useRequirementTestCases } from "@/hooks/store/use-requirement-test-cases";
import { RequirementTestCaseHeaderAction } from "./requirement-relation-action-buttons";
import { RequirementRelationCollapsible } from "./requirement-relation-collapsible";
import { RequirementTestCaseLinkModal } from "./requirement-testcase-link-modal";

/**
 * 关联用例的一行。版式对齐工作项详情 QaCasesCollapsibleContent。
 *
 * 导出以备只读变体复用 —— 两侧的差别只有「能不能解除 / 能不能点开」，
 * 收在 onUnlink / onOpen 是否传入里。
 */
export const RequirementTestCaseRow = ({
  testCase,
  onOpen,
  onUnlink,
}: {
  testCase: TRequirementTestCase;
  onOpen?: (testCase: TRequirementTestCase) => void;
  /** 传了才渲染行尾的解除按钮；只读场景不传 */
  onUnlink?: (testCase: TRequirementTestCase) => void;
}) => {
  const { t } = useTranslation();
  const scopeLabel =
    testCase.repository_project_id === null
      ? t("requirement_detail.test_cases.shared_repository")
      : (testCase.repository_name ?? "");
  const title = testCase.name || testCase.code || "—";

  return (
    <div
      className="group relative flex h-full min-h-11 w-full items-center py-1 pr-2 transition-all hover:bg-surface-2"
      style={{ paddingLeft: 6 }}
    >
      {/* 对齐折叠头的展开箭头占位，标题与工作项用例行同一竖线 */}
      <div className="flex size-5 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center">
        <Tooltip tooltipContent={title} position="top">
          {onOpen ? (
            <button
              type="button"
              className="min-w-0 max-w-full truncate text-left text-body-xs-medium text-primary"
              onClick={() => onOpen(testCase)}
            >
              {title}
            </button>
          ) : (
            <span className="min-w-0 max-w-full truncate text-body-xs-medium text-primary">{title}</span>
          )}
        </Tooltip>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {scopeLabel && (
          <span className="inline-flex h-5 items-center justify-center whitespace-nowrap rounded-sm border-[0.5px] border-strong px-1.5 text-caption-md-medium text-secondary">
            {scopeLabel}
          </span>
        )}
        <span className="inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-sm border-[0.5px] border-strong px-1.5 text-caption-sm-medium text-secondary">
          <CalendarDays className="h-3 w-3 shrink-0" />
          {testCase.created_at ? renderFormattedDate(testCase.created_at) : "—"}
        </span>
        {onUnlink && (
          <Tooltip tooltipContent={t("requirement_detail.test_cases.unlink")}>
            <button
              type="button"
              aria-label={t("requirement_detail.test_cases.unlink")}
              onClick={() => onUnlink(testCase)}
              // 与关联工作项行同一口径：hover 到这一行才浮出解除按钮
              className="grid size-6 shrink-0 place-items-center rounded text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-layer-2 hover:text-secondary focus-visible:opacity-100"
            >
              <Link2Off className="size-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
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
  /**
   * collapsible：自带「用例」折叠头（抽屉用）。
   * plain：只出行与空态，折叠头由整页关联 Tab 卡片的 Tab 代替；hideWhenEmpty / hideAddActions
   * 在这个变体下不起作用 —— 空态必须占位，新增走 Tab 行右侧的操作条。
   */
  variant?: "collapsible" | "plain";
  /** 关联用例数，加载完才报；给 Tab 计数 */
  onCountChange?: (count: number) => void;
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
    variant = "collapsible",
    onCountChange,
  } = props;
  const isPlain = variant === "plain";
  const { t } = useTranslation();
  const { testCases, isLoading, linkTestCases, unlinkTestCase } = useRequirementTestCases({
    workspaceSlug,
    productId,
    requirementId,
  });

  const [localLinkOpen, setLocalLinkOpen] = useState(false);
  const isLinkModalOpen = linkModalOpen ?? localLinkOpen;
  const setIsLinkModalOpen = onLinkModalOpenChange ?? setLocalLinkOpen;
  const [activeCase, setActiveCase] = useState<TRequirementTestCase | null>(null);
  /** 待确认解除的行；非空即弹确认框，与关联工作项同一交互口径 */
  const [caseToUnlink, setCaseToUnlink] = useState<TRequirementTestCase | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const showList = testCases.length > 0 || !hideWhenEmpty;

  useEffect(() => {
    if (isLoading) return;
    onCountChange?.(testCases.length);
  }, [isLoading, onCountChange, testCases.length]);

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

  const list =
    isLoading && !testCases.length ? (
      <div className={cn("px-2.5 pb-2.5", isPlain && "pt-2.5")}>
        <Loader className="flex flex-col gap-1.5">
          <Loader.Item height="36px" />
          <Loader.Item height="36px" />
        </Loader>
      </div>
    ) : testCases.length ? (
      <div className={cn("pb-1", isPlain && "pt-1")}>
        {testCases.map((testCase) => (
          <RequirementTestCaseRow
            key={testCase.id}
            testCase={testCase}
            onOpen={setActiveCase}
            onUnlink={canManage ? setCaseToUnlink : undefined}
          />
        ))}
      </div>
    ) : (
      <p className={cn("text-body-xs-regular text-placeholder", isPlain ? "px-3 py-3" : "px-2.5 py-2.5")}>
        {t("requirement_detail.test_cases.empty")}
      </p>
    );

  return (
    <>
      {isPlain ? (
        list
      ) : (
        showList && (
          <RequirementRelationCollapsible
            title={t("requirement_detail.test_cases.widget_title")}
            icon={FlaskConical}
            count={testCases.length}
            actions={
              canManage && !hideAddActions ? (
                <RequirementTestCaseHeaderAction onLink={() => setIsLinkModalOpen(true)} />
              ) : undefined
            }
          >
            {list}
          </RequirementRelationCollapsible>
        )
      )}

      <UpdateModal
        open={Boolean(activeCase)}
        onClose={() => setActiveCase(null)}
        caseId={activeCase?.id}
        workspaceSlug={workspaceSlug}
        projectId={activeCase?.repository_project_id ?? scopeProjectId}
      />

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
