"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementTypeSchema, TRequirementVersion } from "@plane/types";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Loader } from "@plane/ui";
import { BuiltinCellValue } from "@/components/requirements/requirement-builtin-fields";
import {
  REQUIREMENT_BUILTIN_TITLE_COLUMN,
  resolveBuiltinLayout,
} from "@/components/requirements/requirement-builtin-layout";
import { LeafValue } from "@/components/requirements/requirement-grid-shared";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { diffSnapshotFieldNames } from "./requirement-change-trail";
import {
  HistoryEmpty,
  HistoryEntry,
  HistoryLine,
  HistoryPill,
  HistorySub,
  HistoryTimeline,
} from "./requirement-history-timeline";
import { useRequirementVersions } from "./use-requirement-versions";

/** 从轨迹跳过来时高亮多久 */
const HIGHLIGHT_MS = 1600;

/**
 * 一条需求的版本历史。
 *
 * 每一版都自带 fields_snapshot —— 字段结构立即生效不走审批，用今天的表头去渲染当年的
 * 值会张冠李戴，所以展开某一版时用的是**那一版当时**的字段树。
 *
 * 默认折叠：大多数人打开详情是来看当前内容的，展开才去拉数据。轨迹里点版本徽章会
 * 强制展开并滚过来，这是两个列表之间唯一的联动。
 */
export const RequirementVersionHistory = ({
  workspaceSlug,
  productId,
  requirementId,
  requirementType,
  approvedVersion,
  canRollback = false,
  focusRequest,
  onRolledBack,
  variant = "collapsible",
}: {
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  /** 算相邻两版差异时用来把字段 id 换成字段名 */
  requirementType: TRequirementTypeSchema | null;
  approvedVersion: number | null;
  /** 行在评审中或用户没有写权限时不给回滚入口 —— 服务端也会再拦一道 */
  canRollback?: boolean;
  /** 轨迹发来的跳转请求。token 变化即视为一次新请求，同一版重复点也能再跳一次 */
  focusRequest?: { version: number; token: number } | null;
  onRolledBack?: () => void;
  /**
   * collapsible：自带折叠标题 + 右侧「当前 vN」（默认收起、展开才拉数据）。
   * plain：只出时间线，挂载即拉数据；标题由外层「历史」页签代替，「当前」标在版本行上。
   */
  variant?: "collapsible" | "plain";
}) => {
  const { t } = useTranslation();
  const isPlain = variant === "plain";
  const [isCollapsibleOpen, setIsCollapsibleOpen] = useState(false);
  const isOpen = isPlain || isCollapsibleOpen;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlightedVersion, setHighlightedVersion] = useState<number | null>(null);
  const [versionToRollback, setVersionToRollback] = useState<number | null>(null);
  const { versions, isLoading, isRollingBack, error, rollback } = useRequirementVersions({
    workspaceSlug,
    productId,
    requirementId,
    enabled: isOpen,
  });

  // 新版在前。后端顺序不保证，而「相邻两版求差异」依赖这个次序
  const ordered = useMemo(() => [...versions].sort((a, b) => b.version - a.version), [versions]);

  // 轨迹点过来：先展开自己（这才会触发拉取），拿到数据后再滚过去
  useEffect(() => {
    if (!focusRequest) return;
    setIsCollapsibleOpen(true);
    setHighlightedVersion(focusRequest.version);
  }, [focusRequest]);

  useEffect(() => {
    if (highlightedVersion === null) return;
    const target = ordered.find((version) => version.version === highlightedVersion);
    if (!target) return;
    setExpandedId(target.id);
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(`requirement-version-${target.version}`)
      ?.scrollIntoView({ block: "center", behavior: prefersReducedMotion ? "auto" : "smooth" });
    const timer = setTimeout(() => setHighlightedVersion(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightedVersion, ordered]);

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
      {!isPlain && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsCollapsibleOpen((current) => !current)}
            className="flex items-center gap-1.5 text-body-sm-semibold text-primary"
          >
            {isOpen ? (
              <ChevronDown className="size-3 text-tertiary" />
            ) : (
              <ChevronRight className="size-3 text-tertiary" />
            )}
            {t("requirement_detail.versions.label")}
          </button>
          {approvedVersion !== null && (
            <HistoryPill tone="version">
              {t("requirement_detail.versions.current", { version: approvedVersion })}
            </HistoryPill>
          )}
        </div>
      )}

      {isOpen &&
        (isLoading && !ordered.length ? (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="28px" />
            <Loader.Item height="28px" />
          </Loader>
        ) : error ? (
          <p className="text-body-xs-regular text-secondary">{error}</p>
        ) : !ordered.length ? (
          <HistoryEmpty
            title={t("requirement_detail.versions.empty")}
            description={t("requirement_detail.versions.empty_description")}
          />
        ) : (
          <HistoryTimeline>
            {ordered.map((version, index) => (
              <VersionRow
                key={version.id}
                version={version}
                previous={ordered[index + 1] ?? null}
                requirementType={requirementType}
                workspaceSlug={workspaceSlug}
                isFirst={index === 0}
                isLast={index === ordered.length - 1}
                isExpanded={expandedId === version.id}
                isHighlighted={highlightedVersion === version.version}
                isCurrent={version.version === approvedVersion}
                canRollback={canRollback}
                onToggle={() => setExpandedId(expandedId === version.id ? null : version.id)}
                onRollback={() => setVersionToRollback(version.version)}
              />
            ))}
          </HistoryTimeline>
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
  previous,
  requirementType,
  workspaceSlug,
  isFirst,
  isLast,
  isExpanded,
  isHighlighted,
  isCurrent,
  canRollback,
  onToggle,
  onRollback,
}: {
  version: TRequirementVersion;
  /** 时间上更早的那一版，用来算这一版到底改了什么 */
  previous: TRequirementVersion | null;
  requirementType: TRequirementTypeSchema | null;
  workspaceSlug: string;
  isFirst: boolean;
  isLast: boolean;
  isExpanded: boolean;
  isHighlighted: boolean;
  /** 就是 approved_version 那一版 —— 「当前」标在行上，读版本列表时不必再回头看标题 */
  isCurrent: boolean;
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
  // 内置行顺序按**当前**类型布局（布局与图标同规则不冻结，修订里没有当年那份）；描述不进快照行
  const builtinColumns = useMemo(
    () => [
      REQUIREMENT_BUILTIN_TITLE_COLUMN,
      ...resolveBuiltinLayout(requirementType?.builtin_fields)
        .filter((entry) => entry.key !== "description_html")
        .map((entry) => entry.column),
    ],
    [requirementType?.builtin_fields]
  );

  const changed = useMemo(
    () => diffSnapshotFieldNames(previous?.snapshot, version.snapshot, requirementType, t),
    [previous?.snapshot, requirementType, t, version.snapshot]
  );

  // trail.action 的那几句是「修改了」这种要接宾语的半句，单独用会悬空，所以版本行有自己的文案
  const sentence =
    version.change_type === "update"
      ? changed.length > 0
        ? t("requirement_detail.versions.action.update", { fields: changed.join("、") })
        : t("requirement_detail.versions.action.update_generic")
      : t(`requirement_detail.versions.action.${version.change_type}`);

  return (
    <HistoryEntry
      id={`requirement-version-${version.version}`}
      node="version"
      occurredAt={version.created_at}
      isFirst={isFirst}
      isLast={isLast}
      isHighlighted={isHighlighted}
      onClick={onToggle}
      leading={
        isExpanded ? (
          <ChevronDown className="mt-0.5 size-3 shrink-0 text-placeholder" />
        ) : (
          <ChevronRight className="mt-0.5 size-3 shrink-0 text-placeholder" />
        )
      }
      expanded={
        isExpanded ? (
          // 对齐到内容列而不是轨道 —— 旧实现用 pl-16 对齐左栏宽度，漏算了 gap，差 12px
          <div className="flex flex-col gap-3 border-l-2 border-subtle pl-3.5">
            <div className="grid grid-cols-[minmax(5rem,7rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body-xs-regular">
              {version.display_id && (
                <div className="contents">
                  <span className="text-tertiary">{t("requirements.identifier.column")}</span>
                  <span className="min-w-0">
                    <RequirementIdentifier displayId={version.display_id} />
                  </span>
                </div>
              )}
              {builtinColumns.map((column) => (
                <div key={column.key} className="contents">
                  <span className="text-tertiary">{t(column.labelKey)}</span>
                  <span className="min-w-0">
                    {/* 旧实现在这里 String(snapshot[key])，把枚举、UUID、ISO 时间直接甩给用户；
                        BuiltinCellValue 的注释里本来就写明「版本快照」共用它 */}
                    <BuiltinCellValue columnKey={column.key} values={version.snapshot} />
                  </span>
                </div>
              ))}
              {fields.map((field) => (
                <div key={field.id} className="contents">
                  <span className="text-tertiary">{field.name}</span>
                  <span className="min-w-0">
                    <LeafValue field={field} value={version.snapshot.data?.[field.id]} workspaceSlug={workspaceSlug} />
                  </span>
                </div>
              ))}
            </div>
            {canRollback && (
              <div>
                <Button variant="secondary" size="sm" onClick={onRollback}>
                  <Undo2 className="size-3" />
                  {t("requirement_detail.versions.rollback")}
                </Button>
              </div>
            )}
          </div>
        ) : null
      }
    >
      <HistoryLine actor={version.created_by_detail?.display_name ?? "—"}>{sentence}</HistoryLine>
      <HistorySub>
        <HistoryPill tone="version">{t("requirement_detail.trail.version", { version: version.version })}</HistoryPill>
        {isCurrent && <HistoryPill tone="added">{t("requirement_detail.versions.current_badge")}</HistoryPill>}
        {version.change_request_sequence_id !== null && (
          <HistoryPill>
            {t("requirement_detail.trail.change_request", { sequence: version.change_request_sequence_id })}
          </HistoryPill>
        )}
      </HistorySub>
    </HistoryEntry>
  );
};
