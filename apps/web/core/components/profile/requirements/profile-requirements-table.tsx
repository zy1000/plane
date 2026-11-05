/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { Loader as LoaderIcon } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TProjectRequirement } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, getDate, renderFormattedDate } from "@plane/utils";
// components
import { ProductChip } from "@/components/products/product-chip";
import { RequirementStatusCell } from "@/components/requirements";
import { BuiltinCellValue } from "@/components/requirements/requirement-builtin-fields";
import { RequirementGridPagination } from "@/components/requirements/requirement-grid-pagination";

/** 编号 | 标题 | 所属产品 | 状态 | 优先级 | 负责人 | 计划完成 | 工作项 */
const GRID_CLASS =
  "grid min-w-[920px] grid-cols-[124px_minmax(180px,1fr)_168px_96px_80px_72px_96px_88px] items-center gap-x-3 px-5";

const CLOSED_STATUSES = new Set(["released", "closed"]);

const formatDate = (value: string) => {
  const parsed = getDate(value);
  if (!parsed) return value;
  return renderFormattedDate(parsed, parsed.getFullYear() === new Date().getFullYear() ? "MM-dd" : "yyyy-MM-dd");
};

const isOverdue = (requirement: TProjectRequirement) => {
  const target = getDate(requirement.target_date);
  if (!target || CLOSED_STATUSES.has(requirement.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target < today;
};

type Props = {
  workspaceSlug: string;
  rows: TProjectRequirement[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenDetail: (requirementId: string) => void;
  totalCount: number;
  perPage: number;
  pageIndex: number;
  onPageChange: (pageIndex: number) => void;
  onPerPageChange: (perPage: number) => void;
  /** 本页没有数据时显示的内容（空分组 / 筛选无结果） */
  empty: ReactNode;
};

/**
 * 个人主页「需求」页的表格：列与工作项页同一套样式（无竖线、浅色列头、48px 行），只读，
 * 点标题或编号开详情抽屉。
 */
export function ProfileRequirementsTable(props: Props) {
  const {
    workspaceSlug,
    rows,
    isLoading,
    error,
    onRetry,
    onOpenDetail,
    totalCount,
    perPage,
    pageIndex,
    onPageChange,
    onPerPageChange,
    empty,
  } = props;
  const { t } = useTranslation();
  const isEmpty = rows.length === 0;

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="vertical-scrollbar horizontal-scrollbar scrollbar-lg relative min-h-0 flex-1 overflow-auto">
        <div
          className={cn(
            GRID_CLASS,
            "sticky top-0 z-[2] h-10 border-b border-subtle bg-layer-1 text-12 font-medium text-tertiary"
          )}
        >
          <span>{t("profile.list_columns.id")}</span>
          <span>{t("common.title")}</span>
          <span>{t("profile.list_columns.product")}</span>
          <span>{t("common.state")}</span>
          <span>{t("common.priority")}</span>
          <span>{t("common.assignees")}</span>
          <span>{t("profile.list_columns.target_date")}</span>
          <span>{t("common.work_items")}</span>
        </div>

        {isLoading && isEmpty ? (
          <div className="p-5">
            <Loader className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <Loader.Item key={index} height="40px" />
              ))}
            </Loader>
          </div>
        ) : error ? (
          <div className="grid place-items-center p-16 text-center">
            <div>
              <p className="text-13 text-secondary">{error}</p>
              <Button variant="neutral-primary" size="sm" className="mt-3" onClick={onRetry}>
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : isEmpty ? (
          empty
        ) : (
          rows.map((requirement) => {
            const overdue = isOverdue(requirement);
            const effectiveCount = requirement.issue_count - requirement.cancelled_issue_count;
            return (
              <div
                key={requirement.id}
                className={cn(
                  GRID_CLASS,
                  "min-h-12 border-b border-subtle-1 py-1.5 text-13 text-primary transition-colors hover:bg-layer-transparent-hover"
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpenDetail(requirement.id)}
                  className="truncate text-left text-tertiary tabular-nums hover:text-accent-primary"
                >
                  {requirement.display_id ?? "—"}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenDetail(requirement.id)}
                  title={requirement.title}
                  className="truncate text-left text-14 font-medium text-primary hover:text-accent-primary"
                >
                  {requirement.title}
                </button>
                <div className="flex min-w-0">
                  {requirement.product_id ? (
                    <ProductChip
                      identifier={requirement.product_identifier}
                      name={requirement.product_name}
                      href={`/${workspaceSlug}/products/${requirement.product_id}/requirements`}
                      hideIcon
                      hideIdentifier
                    />
                  ) : (
                    <span className="text-placeholder">—</span>
                  )}
                </div>
                <div className="flex min-w-0">
                  <RequirementStatusCell status={requirement.status} />
                </div>
                <div className="min-w-0">
                  <BuiltinCellValue columnKey="priority" values={requirement} />
                </div>
                <div className="min-w-0">
                  <BuiltinCellValue columnKey="assignee_id" values={requirement} />
                </div>
                <span
                  className={cn("truncate tabular-nums", {
                    "font-medium text-danger-primary": overdue,
                    "text-placeholder": !requirement.target_date,
                  })}
                >
                  {requirement.target_date ? formatDate(requirement.target_date) : "—"}
                </span>
                <span className="truncate text-12 text-secondary tabular-nums">
                  {requirement.issue_count ? (
                    `${requirement.completed_issue_count}/${effectiveCount}`
                  ) : (
                    <span className="text-placeholder">—</span>
                  )}
                </span>
              </div>
            );
          })
        )}
        {isLoading && !isEmpty && (
          <div className="pointer-events-none absolute right-4 top-12">
            <LoaderIcon className="size-4 animate-spin text-tertiary" />
          </div>
        )}
      </div>
      {!error && totalCount > 0 && (
        <RequirementGridPagination
          totalCount={totalCount}
          perPage={perPage}
          pageIndex={pageIndex}
          isLoading={isLoading}
          onPageChange={onPageChange}
          onPerPageChange={onPerPageChange}
        />
      )}
    </section>
  );
}
