"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementVersion } from "@plane/types";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { REQUIREMENT_BUILTIN_COLUMNS } from "@/components/requirements/requirement-builtin-fields";
import { LeafValue } from "@/components/requirements/requirement-grid-shared";
import { useRequirementVersions } from "./use-requirement-versions";

/**
 * 一条需求的版本历史。
 *
 * 每一版都自带 fields_snapshot —— 字段结构立即生效不走审批，用今天的表头去渲染当年的
 * 值会张冠李戴，所以展开某一版时用的是**那一版当时**的字段树。
 *
 * 默认折叠：大多数人打开详情是来看当前内容的，展开才去拉数据。
 */
export const RequirementVersionHistory = ({
  workspaceSlug,
  productId,
  requirementId,
  approvedVersion,
  canRollback = false,
  onRolledBack,
}: {
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  approvedVersion: number | null;
  /** 行在评审中或用户没有写权限时不给回滚入口 —— 服务端也会再拦一道 */
  canRollback?: boolean;
  onRolledBack?: () => void;
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [versionToRollback, setVersionToRollback] = useState<number | null>(null);
  const { versions, isLoading, isRollingBack, error, rollback } = useRequirementVersions({
    workspaceSlug,
    productId,
    requirementId,
    enabled: isOpen,
  });

  const confirmRollback = async () => {
    if (versionToRollback === null) return;
    try {
      await rollback(versionToRollback);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        // 回到已通过的那一版就是「放弃改动」，没有什么要重新提交的；回到更早的版本才要
        message: t(
          versionToRollback === approvedVersion
            ? "requirement_detail.modified_banner.discarded"
            : "requirement_detail.versions.rollback_done",
          { version: versionToRollback }
        ),
      });
      onRolledBack?.();
    } catch (rollbackError) {
      const payload = rollbackError as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("requirement_detail.versions.rollback_failed"),
      });
    } finally {
      setVersionToRollback(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex items-center gap-1.5 text-12 font-medium text-primary"
      >
        {isOpen ? (
          <ChevronDown className="size-3 text-tertiary" />
        ) : (
          <ChevronRight className="size-3 text-tertiary" />
        )}
        {t("requirement_detail.versions.label")}
        {approvedVersion !== null && (
          <span className="font-normal text-tertiary tabular-nums">v{approvedVersion}</span>
        )}
      </button>

      {isOpen &&
        (isLoading && !versions.length ? (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="28px" />
            <Loader.Item height="28px" />
          </Loader>
        ) : error ? (
          <p className="text-12 text-secondary">{error}</p>
        ) : !versions.length ? (
          <p className="text-12 text-placeholder">{t("requirement_detail.versions.empty")}</p>
        ) : (
          <div className="flex flex-col">
            {versions.map((version) => (
              <VersionRow
                key={version.id}
                version={version}
                workspaceSlug={workspaceSlug}
                isExpanded={expandedId === version.id}
                canRollback={canRollback}
                onToggle={() => setExpandedId(expandedId === version.id ? null : version.id)}
                onRollback={() => setVersionToRollback(version.version)}
              />
            ))}
          </div>
        ))}

      <AlertModalCore
        isOpen={versionToRollback !== null}
        isSubmitting={isRollingBack}
        handleClose={() => setVersionToRollback(null)}
        handleSubmit={() => void confirmRollback()}
        title={t("requirement_detail.versions.rollback_title", { version: versionToRollback ?? 0 })}
        content={t("requirement_detail.versions.rollback_description", {
          version: versionToRollback ?? 0,
        })}
        primaryButtonText={{
          default: t("requirement_detail.versions.rollback_confirm"),
          loading: t("requirement_detail.versions.rollback_confirm"),
        }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
};

const VersionRow = ({
  version,
  workspaceSlug,
  isExpanded,
  canRollback,
  onToggle,
  onRollback,
}: {
  version: TRequirementVersion;
  workspaceSlug: string;
  isExpanded: boolean;
  canRollback: boolean;
  onToggle: () => void;
  onRollback: () => void;
}) => {
  const { t } = useTranslation();
  // 用**这一版当时**的字段树，不是今天的
  const fields = useMemo(
    () => (version.fields_snapshot ?? []).filter((field) => field.field_type !== "form"),
    [version.fields_snapshot]
  );

  return (
    <div className="border-b border-subtle last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[4rem_minmax(0,1fr)] gap-3 py-2 text-left text-12"
      >
        <span className="text-tertiary tabular-nums">v{version.version}</span>
        <span className="min-w-0 text-secondary">
          <span className="text-primary">{version.created_by_detail?.display_name ?? "—"}</span>{" "}
          {t(`requirement_detail.trail.action.${version.change_type}`)}
          <span className="text-placeholder">
            {version.change_request_sequence_id !== null && (
              <>
                {" · "}
                {t("requirement_detail.trail.change_request", {
                  sequence: version.change_request_sequence_id,
                })}
              </>
            )}
            {" · "}
            {renderFormattedDate(version.created_at)}
          </span>
        </span>
      </button>

      {isExpanded && (
        <div className="grid grid-cols-[minmax(6rem,max-content)_minmax(0,1fr)] gap-x-3 gap-y-1 pb-3 pl-16 text-12">
          {REQUIREMENT_BUILTIN_COLUMNS.filter((column) => column.key !== "description_html").map(
            (column) => (
              <div key={column.key} className="contents">
                <span className="text-tertiary">{t(column.labelKey)}</span>
                <span className={cn("min-w-0 truncate text-primary")}>
                  {String(
                    (version.snapshot as unknown as Record<string, unknown>)[column.key] ?? "—"
                  )}
                </span>
              </div>
            )
          )}
          {fields.map((field) => (
            <div key={field.id} className="contents">
              <span className="text-tertiary">{field.name}</span>
              <span className="min-w-0">
                <LeafValue
                  field={field}
                  value={version.snapshot.data?.[field.id]}
                  workspaceSlug={workspaceSlug}
                />
              </span>
            </div>
          ))}
          {canRollback && (
            <div className="col-span-2 pt-1">
              <Button variant="secondary" size="sm" onClick={onRollback}>
                <Undo2 className="size-3" />
                {t("requirement_detail.versions.rollback")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
