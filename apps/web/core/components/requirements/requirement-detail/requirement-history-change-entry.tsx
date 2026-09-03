"use client";

/**
 * 时间线上的一条内容改动。
 *
 * 通过审批的那条自带版本号，节点画成带号方块，行内长出版本动作（查看这一版 / 与上一版
 * 并排对比 / 回滚）；没通过的只是圆点。三个展开面板互斥，同一时刻只开一个。
 */
import { useState } from "react";
import { Eye, EyeOff, GitCompareArrows, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementTypeSchema } from "@plane/types";
import { ChangeRequestRequirementDiff } from "@/components/products/requirements/change/change-request-requirement-diff";
import { CHANGE_STATUS_PILL } from "@/components/products/requirements/change/styles";
import { RequirementHistoryApprovalLine } from "./requirement-history-approval-line";
import { RequirementHistoryDiffPanel } from "./requirement-history-diff-panel";
import { buildVersionDiffItem, type THistoryChangeItem } from "./requirement-history-model";
import { RequirementHistorySnapshot } from "./requirement-history-snapshot";
import {
  HistoryActionButton,
  HistoryActor,
  HistoryEntry,
  HistoryHeader,
  HistoryNote,
  HistoryPill,
  HistoryText,
  type THistoryNode,
} from "./requirement-history-timeline";
import type { TSnapshotDiff } from "./requirement-snapshot-diff";

type TPanel = "full" | "snapshot" | "compare" | null;

/** 正文左缘对齐头像后的文字（头像 22 + 间距 8） */
const BODY_INDENT = "ml-[30px]";

const nodeOf = (item: THistoryChangeItem): THistoryNode => {
  if (item.versionNumber !== null) {
    return { kind: "version", label: `v${item.versionNumber}`, isCurrent: item.isCurrent };
  }
  const tone =
    item.status === "pending"
      ? "pending"
      : item.status === "cancelled"
        ? "cancelled"
        : item.status === "approved"
          ? "approved"
          : "rejected";
  return { kind: "dot", tone };
};

export const RequirementHistoryChangeEntry = ({
  item,
  diff,
  workspaceSlug,
  requirementType,
  canRollback,
  isFirst,
  isLast,
  onRollback,
}: {
  item: THistoryChangeItem;
  diff: TSnapshotDiff;
  workspaceSlug: string;
  requirementType: TRequirementTypeSchema | null;
  canRollback: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRollback: (version: number) => void;
}) => {
  const { t } = useTranslation();
  const [panel, setPanel] = useState<TPanel>(null);
  const toggle = (next: TPanel) => setPanel((current) => (current === next ? null : next));

  const { version, previousVersion } = item;
  const builtinLayout = requirementType?.builtin_fields ?? null;

  const sentence =
    item.changeType === "update"
      ? diff.count > 0
        ? t("requirement_detail.history.action.update", { count: diff.count })
        : t("requirement_detail.history.action.update_generic")
      : t(`requirement_detail.history.action.${item.changeType}`);

  // update 没留下快照时也出面板（一句「没有可比较的快照」），create / delete 有内容才出
  const showDiffPanel = item.changeType === "update" ? diff.mode === "unavailable" || diff.rows.length > 0 : diff.rows.length > 0;
  const baseVersion = item.diffItem.base_version;

  const canView = Boolean(version);
  const canCompare = Boolean(version && previousVersion);
  const showRollback = canRollback && Boolean(version) && !item.isCurrent && item.changeType !== "delete";

  return (
    <HistoryEntry node={nodeOf(item)} isFirst={isFirst} isLast={isLast}>
      <HistoryHeader time={item.occurredAt}>
        <HistoryActor user={item.actor} />
        <HistoryText>{sentence}</HistoryText>
        <HistoryPill className={CHANGE_STATUS_PILL[item.status]}>
          {t(`requirement_detail.history.status.${item.status}`)}
        </HistoryPill>
        {item.isCurrent && <HistoryPill tone="version">{t("requirement_detail.history.current_version")}</HistoryPill>}
        {item.sequenceId !== null && (
          <HistoryPill tone="ghost">{t("requirement_detail.history.change_request", { sequence: item.sequenceId })}</HistoryPill>
        )}
      </HistoryHeader>

      {item.reason && <HistoryNote>“{item.reason}”</HistoryNote>}
      <RequirementHistoryApprovalLine approval={item.approval} status={item.status} />

      {showDiffPanel && (
        <RequirementHistoryDiffPanel
          className={BODY_INDENT}
          diff={diff}
          workspaceSlug={workspaceSlug}
          footerLeft={
            baseVersion !== null ? t("requirement_detail.history.diff.relative_to", { version: baseVersion }) : undefined
          }
          canShowFull={diff.mode !== "unavailable"}
          isFullOpen={panel === "full"}
          onToggleFull={() => toggle("full")}
        />
      )}
      {panel === "full" && (
        <div className={BODY_INDENT}>
          <ChangeRequestRequirementDiff
            item={item.diffItem}
            fields={item.fields}
            builtinLayout={builtinLayout}
            workspaceSlug={workspaceSlug}
          />
        </div>
      )}

      {(canView || canCompare || showRollback) && (
        <div className="ml-[26px] flex flex-wrap items-center gap-0.5">
          {canView && (
            <HistoryActionButton
              icon={panel === "snapshot" ? EyeOff : Eye}
              active={panel === "snapshot"}
              onClick={() => toggle("snapshot")}
            >
              {t(
                panel === "snapshot"
                  ? "requirement_detail.history.actions.hide_snapshot"
                  : "requirement_detail.history.actions.view_snapshot"
              )}
            </HistoryActionButton>
          )}
          {canCompare && previousVersion && (
            <HistoryActionButton icon={GitCompareArrows} active={panel === "compare"} onClick={() => toggle("compare")}>
              {panel === "compare"
                ? t("requirement_detail.history.actions.hide_compare")
                : t("requirement_detail.history.actions.compare_previous", { version: previousVersion.version })}
            </HistoryActionButton>
          )}
          {showRollback && version && (
            <HistoryActionButton icon={Undo2} onClick={() => onRollback(version.version)}>
              {t("requirement_detail.history.actions.rollback", { version: version.version })}
            </HistoryActionButton>
          )}
        </div>
      )}

      {panel === "snapshot" && version && (
        <div className={BODY_INDENT}>
          <RequirementHistorySnapshot version={version} requirementType={requirementType} workspaceSlug={workspaceSlug} />
        </div>
      )}
      {panel === "compare" && version && previousVersion && (
        <div className={BODY_INDENT}>
          <ChangeRequestRequirementDiff
            item={buildVersionDiffItem(previousVersion, version, requirementType?.name ?? "")}
            fields={version.fields_snapshot ?? []}
            builtinLayout={builtinLayout}
            workspaceSlug={workspaceSlug}
          />
        </div>
      )}
    </HistoryEntry>
  );
};
