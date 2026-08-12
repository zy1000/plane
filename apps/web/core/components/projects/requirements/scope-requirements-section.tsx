"use client";

import type { SyntheticEvent } from "react";
import { useMemo, useState } from "react";
import { BookOpenText, Layers, Rocket } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { DueDatePropertyIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProjectRequirement, TRequirementProjectStage, TRequirementTypeSchema } from "@plane/types";
import { AlertModalCore, CustomMenu, Loader, Row } from "@plane/ui";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { ProductChip } from "@/components/products/product-chip";
import { ProjectRequirementStageCell } from "@/components/projects/requirements/project-requirement-stage-cell";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";

/**
 * 迭代 / 发布「范围 · 需求」子页共用的列表。
 *
 * 版式契约：与同一页的「工作项」子页逐像素对齐 —— 行用 `Row`
 * （它带 `px-page-x`，就是工作项行的那套左右缩进），行高 min-h-11，右侧属性用
 * 工作项行同款的 dropdown 组件（border-with-text / border-without-text）。
 *
 * 属性只有阶段可写。需求内容（优先级 / 日期 / 负责人）的权威在产品，项目侧没有
 * 写入口，所以那几个 dropdown 一律 disabled —— 用它们而不是自己画胶囊，是为了
 * 空值占位、tooltip、头像堆叠这些细节跟工作项行完全一致。
 */

type TProps = {
  workspaceSlug: string;
  requirements: TProjectRequirement[];
  /** 行首类型图标 + 详情抽屉共用；未加载完时行首回退 Layers */
  requirementTypes: TRequirementTypeSchema[];
  isLoading: boolean;
  error: string | null;
  /** 无 PROJECT_REQUIREMENT_LINK_MANAGE 权限（或容器已归档）时隐藏解除入口、禁用空状态 CTA */
  canManage: boolean;
  unlinkingRequirementId: string | null;
  updatingStageRequirementId: string | null;
  onOpenLinkModal: () => void;
  onUnlink: (requirementId: string) => Promise<void>;
  onStageChange: (requirementId: string, stage: TRequirementProjectStage) => void;
  onOpenDetail: (requirementId: string) => void;
};

export const ScopeRequirementsSection = (props: TProps) => {
  const {
    workspaceSlug,
    requirements,
    requirementTypes,
    isLoading,
    error,
    canManage,
    unlinkingRequirementId,
    updatingStageRequirementId,
    onOpenLinkModal,
    onUnlink,
    onStageChange,
    onOpenDetail,
  } = props;
  const { t } = useTranslation();
  /** 解除关联的二次确认对象。确认框里展示编号 + 标题，避免解错行 */
  const [pendingUnlinkRow, setPendingUnlinkRow] = useState<TProjectRequirement | null>(null);
  const requirementTypeById = useMemo(
    () => new Map(requirementTypes.map((requirementType) => [requirementType.id, requirementType])),
    [requirementTypes]
  );

  const handleUnlinkConfirm = () => {
    if (!pendingUnlinkRow) return;
    void (async () => {
      await onUnlink(pendingUnlinkRow.id);
      setPendingUnlinkRow(null);
    })();
  };

  /** 属性区落在可点的行里：点属性是操作那颗属性，不该顺带把详情抽屉弹出来 */
  const stopRowActivation = (event: SyntheticEvent<HTMLDivElement>) => event.stopPropagation();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isLoading ? (
        <div className="p-4">
          <Loader className="space-y-2">
            <Loader.Item height="44px" />
            <Loader.Item height="44px" />
            <Loader.Item height="44px" />
          </Loader>
        </div>
      ) : error ? (
        <p className="p-4 text-sm text-danger-primary">{error}</p>
      ) : requirements.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center px-4">
          <div className="flex max-w-md flex-col items-center gap-2 text-center">
            <BookOpenText className="mb-2 size-10 text-placeholder" strokeWidth={1.2} aria-hidden />
            <h4 className="text-body-md-semibold text-primary">
              {t("project_requirements.container.empty_title")}
            </h4>
            <p className="text-body-sm-regular text-tertiary">
              {t("project_requirements.container.empty_description")}
            </p>
            {canManage && (
              <Button variant="primary" size="lg" className="mt-3" onClick={onOpenLinkModal}>
                {t("project_requirements.container.link_button")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto">
          {requirements.map((row) => {
            const requirementType = requirementTypeById.get(row.requirement_type_id);
            return (
              <Row
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenDetail(row.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenDetail(row.id);
                  }
                }}
                className="group/req-row flex min-h-11 cursor-pointer items-center gap-2 border-b border-subtle py-3 text-13 outline-none transition-colors last:border-b-transparent hover:bg-layer-transparent-hover focus-visible:bg-layer-transparent-hover"
              >
                {/* 行首放需求类型图标，对齐工作项行的 WorkItemTypeIcon */}
                {requirementType ? (
                  <TypeIcon
                    iconProps={requirementType.logo_props?.icon}
                    className="size-3.5"
                    iconClassName="size-3.5"
                  />
                ) : (
                  <Layers className="size-3.5 shrink-0 text-tertiary" aria-hidden />
                )}
                {row.display_id && <RequirementIdentifier displayId={row.display_id} />}
                <Tooltip tooltipContent={row.title}>
                  <span className="min-w-0 flex-1 truncate text-body-xs-medium text-primary">{row.title}</span>
                </Tooltip>

                <div
                  className="ml-auto flex flex-shrink-0 flex-wrap items-center gap-2"
                  onClick={stopRowActivation}
                  onFocus={stopRowActivation}
                >
                  {/*
                    研发段可人工设置，其余三档服务端派生。stage_locked = 挂在在途发布单上，
                    此时整行阶段锁死；提交中的那一行也按锁定处理，避免连点发出两次写入。
                  */}
                  <div className="h-5">
                    <ProjectRequirementStageCell
                      variant="chip"
                      stage={row.stage}
                      latestCycleName={row.latest_cycle_name}
                      latestReleaseName={row.latest_release_name}
                      carryover={row.carryover}
                      onChange={canManage ? (next) => onStageChange(row.id, next) : undefined}
                      locked={
                        row.stage_locked || row.stage === "released" || updatingStageRequirementId === row.id
                      }
                    />
                  </div>

                  <div className="h-5">
                    <PriorityDropdown
                      value={row.priority}
                      onChange={() => {}}
                      disabled
                      buttonVariant="border-without-text"
                      // 抵消 disabled 外层 text-secondary，避免优先级色块比工作项行更「灰」
                      buttonContainerClassName="text-primary"
                      showTooltip
                    />
                  </div>

                  <div className="h-5">
                    <DateDropdown
                      value={row.target_date ?? null}
                      onChange={() => {}}
                      placeholder={t("common.order_by.due_date")}
                      icon={<DueDatePropertyIcon className="h-3 w-3 shrink-0" />}
                      buttonVariant={row.target_date ? "border-with-text" : "border-without-text"}
                      disabled
                      showTooltip
                    />
                  </div>

                  <div className="h-5">
                    {/* 不传 projectId：需求负责人取自工作区成员，与详情抽屉的属性条同口径 */}
                    <MemberDropdown
                      multiple={false}
                      value={row.assignee_id}
                      onChange={() => {}}
                      disabled
                      buttonVariant={row.assignee_id ? "transparent-without-text" : "border-without-text"}
                      buttonClassName={row.assignee_id ? "hover:bg-transparent px-0" : ""}
                      showTooltip={!row.assignee_id}
                    />
                  </div>

                  {row.product_id && (
                    <div className="h-5">
                      <ProductChip
                        appearance="property"
                        identifier={row.product_identifier}
                        name={row.product_name}
                        href={`/${workspaceSlug}/products/${row.product_id}/requirements`}
                        className="max-w-40"
                      />
                    </div>
                  )}

                  {/* 目标发布：released 档的推导依据，也是研发之后的下一站。
                      壳与工作项行 ReleaseDropdown（border-with-text）对齐。 */}
                  {row.latest_release_name && (
                    <div className="h-5">
                      <Tooltip tooltipContent={row.latest_release_name}>
                        <span className="inline-flex h-5 max-w-40 items-center gap-1.5 rounded-sm border-[0.5px] border-strong px-1.5 text-caption-md-medium text-secondary">
                          <Rocket className="size-3 shrink-0 text-tertiary" aria-hidden />
                          <span className="truncate">{row.latest_release_name}</span>
                        </span>
                      </Tooltip>
                    </div>
                  )}

                  {/*
                    行操作收进 ⋯，与工作项行一致：常显，不依赖 hover。
                    无权限时整颗按钮不渲染。
                  */}
                  {canManage && (
                    <CustomMenu
                      placement="bottom-end"
                      closeOnSelect
                      /*
                       * 用内置的 ellipsis，不要 customButton={<IconButton/>}：CustomMenu
                       * 会把 customButton 包进一个真正的 <button>，再塞一颗 IconButton
                       * 进去就是 button 套 button（DOM 非法，React 也会告警）。
                       */
                      ellipsis
                      ariaLabel={t("project_requirements.container.unlink")}
                    >
                      <CustomMenu.MenuItem
                        onClick={() => setPendingUnlinkRow(row)}
                        disabled={unlinkingRequirementId !== null}
                        className="text-danger-primary"
                      >
                        {t("project_requirements.container.unlink")}
                      </CustomMenu.MenuItem>
                    </CustomMenu>
                  )}
                </div>
              </Row>
            );
          })}
        </div>
      )}

      <AlertModalCore
        isOpen={pendingUnlinkRow !== null}
        isSubmitting={pendingUnlinkRow !== null && unlinkingRequirementId === pendingUnlinkRow.id}
        handleClose={() => setPendingUnlinkRow(null)}
        handleSubmit={handleUnlinkConfirm}
        title={t("project_requirements.container.unlink")}
        content={
          pendingUnlinkRow
            ? [pendingUnlinkRow.display_id, pendingUnlinkRow.title].filter(Boolean).join(" · ")
            : ""
        }
        // AlertModalCore 的按钮默认是英文硬编码，本仓库其余调用点也都显式传
        primaryButtonText={{ default: t("project_requirements.container.unlink"), loading: t("loading") }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
};
