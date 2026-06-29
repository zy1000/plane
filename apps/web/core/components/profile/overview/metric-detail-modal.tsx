"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { ConfigProvider, Modal, Pagination, Tree } from "antd";
import type { TreeProps } from "antd";
import { ChevronDown, FolderTree, RotateCcw } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import type {
  IProfileMetricCycle,
  IProfileMetricExecutionCase,
  IProfileMetricRelease,
  IProfileMetricReviewCase,
  IProfileMetricTreeNode,
  IProfileMetricWorkItem,
  TProfileMetricItem,
  TProfileMetricKey,
} from "@plane/types";
import { cn, generateWorkItemLink, getDate, renderFormattedDate } from "@plane/utils";
// hooks
import { PROFILE_METRIC_PAGE_SIZE, useProfileMetricDetails } from "@/hooks/use-profile-metric-details";

type Props = {
  metric: TProfileMetricKey;
  metricTitle: string;
  onClose: () => void;
  open: boolean;
  userId: string;
  workspaceSlug: string;
};

const WORK_ITEM_METRICS = new Set<TProfileMetricKey>([
  "today_pending_issues",
  "week_pending_issues",
  "overdue_issues",
  "unscheduled_pending_issues",
  "pending_approval_issues",
  "assigned_issues",
  "created_issues",
  "subscribed_issues",
]);

const DEFAULT_TREE_WIDTH = 256;
const MIN_TREE_WIDTH = 220;
const MAX_TREE_WIDTH = 420;

const clampTreeWidth = (width: number) => Math.min(MAX_TREE_WIDTH, Math.max(MIN_TREE_WIDTH, width));

function formatDate(value: string | null) {
  return value ? renderFormattedDate(getDate(value), "yyyy/MM/dd") : "-";
}

function formatDateRange(start: string | null, end: string | null) {
  return `${formatDate(start)} ~ ${formatDate(end)}`;
}

function treeNodeTitle(node: IProfileMetricTreeNode) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-2 pr-2">
      <span className="truncate" title={node.name}>
        {node.name}
      </span>
      <span className="shrink-0 text-11 text-placeholder tabular-nums">{node.count}</span>
    </span>
  );
}

function buildTreeData(
  nodes: IProfileMetricTreeNode[],
  allProjectsLabel: string,
  total: number
): TreeProps["treeData"] {
  return [
    {
      key: "all",
      title: (
        <span className="flex min-w-0 items-center justify-between gap-2 pr-2 font-medium">
          <span className="truncate">{allProjectsLabel}</span>
          <span className="shrink-0 text-11 text-placeholder tabular-nums">{total}</span>
        </span>
      ),
      children: nodes.map((node) => ({
        key: node.id,
        title: treeNodeTitle(node),
        children: node.children?.map((child) => ({ key: child.id, title: treeNodeTitle(child), isLeaf: true })),
      })),
    },
  ];
}

function TitleLink({ href, children }: { children: ReactNode; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate !text-primary visited:!text-primary hover:!text-primary hover:underline active:!text-primary"
    >
      {children}
    </a>
  );
}

function StateCell({ item }: { item: IProfileMetricWorkItem }) {
  if (!item.state) return <span className="text-placeholder">-</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-layer-1 px-2 py-1 text-11 text-secondary">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.state.color }} />
      <span className="truncate">{item.state.name}</span>
    </span>
  );
}

function WorkItemTable({
  items,
  metric,
  workspaceSlug,
}: {
  items: IProfileMetricWorkItem[];
  metric: TProfileMetricKey;
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const hasApprovalState = metric === "pending_approval_issues";
  const columnCount = hasApprovalState ? 6 : 5;

  return (
    <Table className="min-w-[850px] table-fixed" wrapperClassName="overflow-visible">
      <TableHeader className="border-y-0 bg-transparent [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-1 [&_th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <TableRow>
          <TableHead className="h-9 w-[34%]">{t("profile.stats.metric_details.columns.work_item")}</TableHead>
          <TableHead className="h-9 w-[18%]">{t("profile.stats.metric_details.columns.project")}</TableHead>
          <TableHead className="h-9 w-[14%]">{t("profile.stats.metric_details.columns.state")}</TableHead>
          {hasApprovalState && (
            <TableHead className="h-9 w-[14%]">{t("profile.stats.metric_details.columns.target_state")}</TableHead>
          )}
          <TableHead className="h-9 w-[12%]">{t("profile.stats.metric_details.columns.priority")}</TableHead>
          <TableHead className="h-9 w-[14%]">{t("profile.stats.metric_details.columns.target_date")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} className="hover:bg-layer-1">
            <TableCell className="min-w-0">
              <TitleLink
                href={generateWorkItemLink({
                  workspaceSlug,
                  projectId: item.project.id,
                  issueId: item.id,
                  projectIdentifier: item.project.identifier,
                  sequenceId: item.sequence_id,
                })}
              >
                <span className="mr-2 text-secondary">
                  {item.project.identifier}-{item.sequence_id}
                </span>
                {item.title}
              </TitleLink>
            </TableCell>
            <TableCell className="truncate" title={item.project.name}>
              {item.project.name}
            </TableCell>
            <TableCell>
              <StateCell item={item} />
            </TableCell>
            {hasApprovalState && (
              <TableCell>
                {item.approval_to_state ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-layer-1 px-2 py-1 text-11 text-secondary">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: item.approval_to_state.color }}
                    />
                    <span className="truncate">{item.approval_to_state.name}</span>
                  </span>
                ) : (
                  "-"
                )}
              </TableCell>
            )}
            <TableCell className="capitalize">{item.priority}</TableCell>
            <TableCell className="tabular-nums">{formatDate(item.target_date)}</TableCell>
          </TableRow>
        ))}
        {!items.length && <EmptyTableRow colSpan={columnCount} />}
      </TableBody>
    </Table>
  );
}

function ResponsibilityTable({
  items,
  workspaceSlug,
}: {
  items: Array<IProfileMetricCycle | IProfileMetricRelease>;
  workspaceSlug: string;
}) {
  const { t } = useTranslation();

  return (
    <Table className="min-w-[760px] table-fixed" wrapperClassName="overflow-visible">
      <TableHeader className="border-y-0 bg-transparent [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-1 [&_th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <TableRow>
          <TableHead className="h-9 w-[30%]">{t("profile.stats.metric_details.columns.title")}</TableHead>
          <TableHead className="h-9 w-[20%]">{t("profile.stats.metric_details.columns.project")}</TableHead>
          <TableHead className="h-9 w-[16%]">{t("profile.stats.metric_details.columns.status")}</TableHead>
          <TableHead className="h-9 w-[18%]">{t("profile.stats.metric_details.columns.owner")}</TableHead>
          <TableHead className="h-9 w-[24%]">{t("profile.stats.metric_details.columns.date_range")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} className="hover:bg-layer-1">
            <TableCell className="min-w-0">
              <TitleLink
                href={`/${workspaceSlug}/projects/${item.project.id}/${item.entity_type === "cycle" ? "cycles" : "releases"}/${item.id}/overview`}
              >
                {item.title}
              </TitleLink>
            </TableCell>
            <TableCell className="truncate" title={item.project.name}>
              {item.project.name}
            </TableCell>
            <TableCell>{item.status ?? "-"}</TableCell>
            <TableCell className="truncate" title={item.owner?.display_name ?? "-"}>
              {item.owner?.display_name ?? "-"}
            </TableCell>
            <TableCell className="tabular-nums">{formatDateRange(item.start_date, item.end_date)}</TableCell>
          </TableRow>
        ))}
        {!items.length && <EmptyTableRow colSpan={5} />}
      </TableBody>
    </Table>
  );
}

function QaCaseTable({
  items,
  metric,
  workspaceSlug,
}: {
  items: Array<IProfileMetricExecutionCase | IProfileMetricReviewCase>;
  metric: TProfileMetricKey;
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const isExecution = metric === "pending_execution_cases";

  return (
    <Table className="min-w-[850px] table-fixed" wrapperClassName="overflow-visible">
      <TableHeader className="border-y-0 bg-transparent [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-1 [&_th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <TableRow>
          <TableHead className="h-9 w-[34%]">{t("profile.stats.metric_details.columns.test_case")}</TableHead>
          <TableHead className="h-9 w-[18%]">{t("profile.stats.metric_details.columns.project")}</TableHead>
          <TableHead className="h-9 w-[20%]">
            {isExecution
              ? t("profile.stats.metric_details.columns.plan")
              : t("profile.stats.metric_details.columns.review")}
          </TableHead>
          <TableHead className="h-9 w-[12%]">{t("profile.stats.metric_details.columns.priority")}</TableHead>
          {isExecution && (
            <TableHead className="h-9 w-[16%]">{t("profile.stats.metric_details.columns.assignee")}</TableHead>
          )}
          <TableHead className="h-9 w-[16%]">{t("profile.stats.metric_details.columns.result")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const executionItem = item.entity_type === "execution_case" ? item : null;
          const reviewItem = item.entity_type === "review_case" ? item : null;
          const parent = executionItem?.plan ?? reviewItem?.review;
          const href = executionItem
            ? `/${workspaceSlug}/projects/${item.project.id}/testhub/test-execution?case_id=${item.case_id}&plan_id=${executionItem.plan.id}`
            : `/${workspaceSlug}/projects/${item.project.id}/testhub/case-review?review_id=${reviewItem?.review.id}&case_id=${item.case_id}`;
          return (
            <TableRow key={item.id} className="hover:bg-layer-1">
              <TableCell className="min-w-0">
                <TitleLink href={href}>
                  <span className="mr-2 text-secondary">{item.code}</span>
                  {item.title}
                </TitleLink>
              </TableCell>
              <TableCell className="truncate" title={item.project.name}>
                {item.project.name}
              </TableCell>
              <TableCell className="truncate" title={parent?.name}>
                {parent?.name}
              </TableCell>
              <TableCell>{item.priority}</TableCell>
              {isExecution && (
                <TableCell className="truncate" title={executionItem?.assignee?.display_name ?? "-"}>
                  {executionItem?.assignee?.display_name ?? "-"}
                </TableCell>
              )}
              <TableCell>{executionItem?.result ?? reviewItem?.personal_review_status ?? "-"}</TableCell>
            </TableRow>
          );
        })}
        {!items.length && <EmptyTableRow colSpan={isExecution ? 6 : 5} />}
      </TableBody>
    </Table>
  );
}

function EmptyTableRow({ colSpan }: { colSpan: number }) {
  const { t } = useTranslation();
  return (
    <TableRow>
      <TableCell colSpan={colSpan}>
        <div className="grid h-28 place-items-center text-12 text-placeholder">
          {t("profile.stats.metric_details.empty")}
        </div>
      </TableCell>
    </TableRow>
  );
}

function MetricTable({
  items,
  metric,
  workspaceSlug,
}: {
  items: TProfileMetricItem[];
  metric: TProfileMetricKey;
  workspaceSlug: string;
}) {
  if (WORK_ITEM_METRICS.has(metric))
    return <WorkItemTable items={items as IProfileMetricWorkItem[]} metric={metric} workspaceSlug={workspaceSlug} />;
  if (metric === "responsible_cycles" || metric === "responsible_releases")
    return (
      <ResponsibilityTable
        items={items as Array<IProfileMetricCycle | IProfileMetricRelease>}
        workspaceSlug={workspaceSlug}
      />
    );
  return (
    <QaCaseTable
      items={items as Array<IProfileMetricExecutionCase | IProfileMetricReviewCase>}
      metric={metric}
      workspaceSlug={workspaceSlug}
    />
  );
}

export function ProfileMetricDetailModal({ metric, metricTitle, onClose, open, userId, workspaceSlug }: Props) {
  const { t } = useTranslation();
  const [treeWidth, setTreeWidth] = useState(DEFAULT_TREE_WIDTH);
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(DEFAULT_TREE_WIDTH);
  const { error, isItemsLoading, isTreeLoading, items, page, retry, selectedNodeId, selectNode, setPage, tree } =
    useProfileMetricDetails({ metric, open, userId, workspaceSlug });

  useEffect(
    () => () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    []
  );

  const handleResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    isResizingRef.current = true;
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = treeWidth;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.preventDefault();
  };

  const handleResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isResizingRef.current) return;
    setTreeWidth(clampTreeWidth(resizeStartWidthRef.current + event.clientX - resizeStartXRef.current));
  };

  const handleResizeEnd = (event: PointerEvent<HTMLDivElement>) => {
    isResizingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setTreeWidth((currentWidth) => clampTreeWidth(currentWidth + (event.key === "ArrowRight" ? 16 : -16)));
  };

  const treeData = useMemo(
    () => buildTreeData(tree?.nodes ?? [], t("profile.stats.metric_details.all_projects"), tree?.count ?? 0),
    [t, tree]
  );
  const expandedKeys = useMemo(
    () => ["all", ...(tree?.nodes.filter((node) => node.children?.length).map((node) => node.id) ?? [])],
    [tree?.nodes]
  );

  return (
    <Modal
      title={
        <div className="flex min-h-11 items-center gap-2 pr-2">
          <FolderTree className="size-4 text-placeholder" />
          <span className="text-16 font-medium text-primary">{metricTitle}</span>
          <span className="text-12 font-normal text-placeholder">
            {t("profile.stats.metric_details.total", { count: tree?.count ?? 0 })}
          </span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={1200}
      destroyOnClose
      styles={{ body: { padding: 0, overflow: "hidden" } }}
    >
      <div className="flex h-[76vh] max-h-[760px] min-h-[520px] bg-surface-1">
        <aside
          className="relative flex shrink-0 flex-col border-r border-subtle"
          style={{ width: treeWidth, minWidth: MIN_TREE_WIDTH, maxWidth: MAX_TREE_WIDTH }}
        >
          <div
            id="profile-metric-scope-label"
            className="border-b border-subtle px-4 py-3 text-11 font-medium tracking-wide text-secondary uppercase"
          >
            {t("profile.stats.metric_details.filter_title")}
          </div>
          <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto py-3 pr-2">
            {isTreeLoading ? (
              <div className="px-2 py-3 text-12 text-placeholder">{t("profile.stats.metric_details.loading")}</div>
            ) : (
              <ConfigProvider theme={{ components: { Tree: { indentSize: 16 } } }}>
                <Tree
                  key={`${metric}-${tree?.count ?? 0}`}
                  blockNode
                  showLine={false}
                  switcherIcon={({ expanded, isLeaf }) =>
                    isLeaf ? null : (
                      <ChevronDown
                        className="size-3.5 text-tertiary transition-transform"
                        style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                      />
                    )
                  }
                  defaultExpandedKeys={expandedKeys}
                  selectedKeys={[selectedNodeId]}
                  treeData={treeData}
                  onSelect={(keys) => keys[0] && selectNode(String(keys[0]))}
                  className="bg-transparent [&_.ant-tree-switcher]:!mr-0 [&_.ant-tree-switcher]:!w-4"
                />
              </ConfigProvider>
            )}
          </div>
          <div
            role="separator"
            aria-labelledby="profile-metric-scope-label"
            aria-orientation="vertical"
            aria-valuemin={MIN_TREE_WIDTH}
            aria-valuemax={MAX_TREE_WIDTH}
            aria-valuenow={treeWidth}
            tabIndex={0}
            onKeyDown={handleResizeKeyDown}
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize border-r border-transparent outline-none hover:border-accent-strong focus-visible:border-accent-strong"
          />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {error ? (
            <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
              <div>
                <p className="text-13 font-medium text-primary">{t("profile.stats.metric_details.error")}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-subtle px-3 py-1.5 text-12 text-secondary hover:bg-layer-1"
                >
                  <RotateCcw className="size-3.5" />
                  {t("profile.stats.metric_details.retry")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "vertical-scrollbar relative scrollbar-sm min-h-0 flex-1 overflow-auto px-4",
                  isItemsLoading && items && "opacity-60"
                )}
              >
                {isItemsLoading && !items && (
                  <div className="absolute inset-0 z-20 grid place-items-center bg-surface-1 text-12 text-placeholder">
                    {t("profile.stats.metric_details.loading")}
                  </div>
                )}
                <MetricTable items={items?.data ?? []} metric={metric} workspaceSlug={workspaceSlug} />
              </div>
              <div className="flex h-14 shrink-0 items-center justify-between border-t border-subtle px-4">
                <span className="text-11 text-placeholder">
                  {t("profile.stats.metric_details.total", { count: items?.count ?? 0 })}
                </span>
                {(items?.count ?? 0) > PROFILE_METRIC_PAGE_SIZE && (
                  <Pagination
                    current={page}
                    pageSize={PROFILE_METRIC_PAGE_SIZE}
                    total={items?.count ?? 0}
                    onChange={setPage}
                    size="small"
                    showSizeChanger={false}
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
