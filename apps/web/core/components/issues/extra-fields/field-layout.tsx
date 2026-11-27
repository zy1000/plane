import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { TIssueExtraFieldValue } from "@plane/types";
import { cn } from "@plane/utils";
import { useIssueLayoutPreferences } from "@/hooks/use-issue-layout-preferences";
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";
import type {
  TIssueFieldPlacement,
  TIssueLayoutContainer,
  TIssueLayoutContext,
  TIssueLayoutGroup,
  TStoredIssueTypeFieldLayout,
} from "@/services/project/issue-type-layout.types";
import {
  ISSUE_LAYOUT_ERROR_EVENT,
  ISSUE_LAYOUT_FOCUS_EVENT,
  ISSUE_LAYOUT_VALIDATE_EVENT,
  isLongLayoutField,
  layoutFieldClass,
  layoutForContext,
  layoutGridClass,
  resolveIssueTypeLayout,
} from "@/utils/issue-type-layout";
import { findValueForField, isValueEmpty } from "./extra-field-control";

type TProps = {
  layout?: TStoredIssueTypeFieldLayout;
  fields: TTypeExtraField[];
  values?: TIssueExtraFieldValue[];
  context: TIssueLayoutContext;
  preferenceKey?: string;
  issueId?: string;
  errors?: Record<string, string>;
  validationAttempt?: number;
  /** 字段区标题（如「缺陷字段」）：传了就在最上面出一行「标题 + 总完成度」，操作按钮靠右 */
  title?: string;
  /** 没有任何分组时，全部字段所在那张卡片的名称（如「缺陷信息」） */
  ungroupedName?: string;
  renderField: (field: TTypeExtraField, placement: TIssueFieldPlacement, clearError: () => void) => ReactNode;
};
const EMPTY_VALUES: TIssueExtraFieldValue[] = [];
const TOOLBAR_BUTTON_CLASS =
  "rounded-md border border-subtle px-2.5 py-1 text-12 text-secondary hover:bg-layer-1 hover:text-primary";

/**
 * 字段一律放在分组卡片里：容器（根 / 页面）里没归组的字段，没有别的分组时自成一组，
 * 否则收进排在最后的「其他」，不插在已有分组中间。
 */
const groupsOf = (container: TIssueLayoutContainer, id: string, soleName: string): TIssueLayoutGroup[] =>
  container.fields.length === 0
    ? container.groups
    : [
        ...container.groups,
        {
          id,
          name: container.groups.length > 0 ? "其他" : soleName,
          columns: container.columns,
          collapsible: true,
          default_collapsed: false,
          fields: container.fields,
        },
      ];

/** 「已填 n/总数」+ 进度条，填满变绿 */
const FillProgress = ({ filled, total }: { filled: number; total: number }) => (
  <span className="flex shrink-0 items-center gap-2 text-12 font-normal text-tertiary tabular-nums">
    已填 {filled}/{total}
    <span className="h-[5px] w-[72px] overflow-hidden rounded-full bg-layer-3">
      <span
        className={cn("block h-full rounded-full", filled === total ? "bg-success-primary" : "bg-accent-primary")}
        style={{ width: `${total > 0 ? (filled / total) * 100 : 0}%` }}
      />
    </span>
  </span>
);

/**
 * 按类型布局渲染自定义字段：每个分组一张卡片（标题栏带完成度、可收起），卡片里短字段排网格、
 * 长文本统一排在下半部；根上的分组在最前，再往下是页面页签和页内分组。
 * All pages remain mounted so changing tabs or collapsing a group preserves drafts.
 */
export function IssueFieldLayout({
  layout,
  fields,
  values = EMPTY_VALUES,
  context,
  preferenceKey,
  issueId,
  errors = {},
  validationAttempt = 0,
  title,
  ungroupedName = "基本信息",
  renderField,
}: TProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState("");
  const [focusField, setFocusField] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const { preferences, update } = useIssueLayoutPreferences(preferenceKey);
  const resolved = useMemo(() => resolveIssueTypeLayout(layout, fields), [layout, fields]);
  const allErrors = { ...serverErrors, ...errors };
  const errorKey = Object.keys(allErrors)
    .filter((fieldId) => fields.some((field) => field.id === fieldId))
    .join(",");
  const visible = useMemo(
    () => layoutForContext(resolved, fields, context, errorKey.split(",")),
    [resolved, fields, context, errorKey]
  );
  const pages = visible.pages;
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const isEmpty = (fieldId: string) => isValueEmpty(findValueForField(values, fieldId));
  const hiddenEmpty = context === "detail" && !preferences.showEmpty;
  const rootGroups = useMemo(() => groupsOf(visible, "ungrouped:root", ungroupedName), [visible, ungroupedName]);
  const pageGroups = useMemo(
    () => new Map(visible.pages.map((page) => [page.id, groupsOf(page, `ungrouped:${page.id}`, page.name)])),
    [visible]
  );
  // 每个字段的落点：所在页面（根上的为 null）和分组卡片
  const locations = useMemo(() => {
    const locate = (groups: TIssueLayoutGroup[], pageId: string | null) =>
      groups.flatMap((group) => group.fields.map((entry) => ({ pageId, group, entry })));
    return [...locate(rootGroups, null), ...[...pageGroups].flatMap(([pageId, groups]) => locate(groups, pageId))];
  }, [rootGroups, pageGroups]);
  const allGroups = [...rootGroups, ...[...pageGroups.values()].flat()];
  const missingRequired = locations.filter(
    ({ entry }) => fieldMap.get(entry.field_id)?.is_required && isEmpty(entry.field_id)
  );
  const selectedPage = pages.some((page) => page.id === activePage) ? activePage : pages[0]?.id;
  const openField = useCallback(
    (fieldId: string) => {
      const location = locations.find(({ entry }) => entry.field_id === fieldId);
      if (!location) return;
      if (location.pageId) setActivePage(location.pageId);
      update((previous) => ({
        ...previous,
        showEmpty: true,
        collapsed: { ...previous.collapsed, [location.group.id]: false },
      }));
      setFocusField(fieldId);
      setAttempt((value) => value + 1);
    },
    [locations, update]
  );

  useEffect(() => {
    if (errorKey) openField(errorKey.split(",")[0]);
    // Only a new validation attempt or changed error targets should move focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorKey, validationAttempt, context]);

  useEffect(() => {
    if (!focusField) return;
    const frame = requestAnimationFrame(() => {
      const element = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-layout-field]") ?? []).find(
        (node) => node.dataset.layoutField === focusField
      );
      // 居中：nearest 会把屏幕下方的字段刚好贴到可视区底边，看着像没定位到
      element?.scrollIntoView({ block: "center", behavior: "auto" });
      (
        element?.querySelector<HTMLElement>(
          "input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex='0']"
        ) ?? element
      )?.focus({
        preventScroll: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusField, attempt]);

  useEffect(() => {
    if (!issueId) return;
    const validate = (event: Event) => {
      if (context !== "edit" || (event as CustomEvent).detail?.issueId !== issueId || missingRequired.length === 0)
        return;
      event.preventDefault();
      setServerErrors(Object.fromEntries(missingRequired.map(({ entry }) => [entry.field_id, "此字段为必填项"])));
      openField(missingRequired[0].entry.field_id);
    };
    const receiveError = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.issueId !== issueId) return;
      const next = Object.fromEntries(
        Object.entries(detail.errors ?? {}).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join("；") : String(value),
        ])
      );
      setServerErrors(next);
      const target = Object.keys(next).find((key) => fieldMap.has(key));
      if (target) openField(target);
    };
    const focus = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.issueId === issueId && fieldMap.has(detail.fieldId)) openField(detail.fieldId);
    };
    window.addEventListener(ISSUE_LAYOUT_VALIDATE_EVENT, validate);
    window.addEventListener(ISSUE_LAYOUT_ERROR_EVENT, receiveError);
    window.addEventListener(ISSUE_LAYOUT_FOCUS_EVENT, focus);
    return () => {
      window.removeEventListener(ISSUE_LAYOUT_VALIDATE_EVENT, validate);
      window.removeEventListener(ISSUE_LAYOUT_ERROR_EVENT, receiveError);
      window.removeEventListener(ISSUE_LAYOUT_FOCUS_EVENT, focus);
    };
  });

  useEffect(() => {
    if (context === "detail") setServerErrors({});
  }, [context]);
  const clearFieldError = (fieldId: string) =>
    setServerErrors((current) => {
      if (!(fieldId in current)) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });

  const emptyCount = locations.filter(({ entry }) => isEmpty(entry.field_id)).length;
  const pageMissing = (pageId: string) => missingRequired.filter((item) => item.pageId === pageId).length;
  const pageCount = (pageId: string) => locations.filter((item) => item.pageId === pageId).length;
  const navigation = pages.map((page) => ({ id: page.id, name: page.name }));

  const isGroupCollapsed = (group: TIssueLayoutGroup) =>
    group.collapsible && (preferences.collapsed[group.id] ?? group.default_collapsed);
  const collapsibleGroups = allGroups.filter((group) => group.collapsible);
  const hasCollapsible = collapsibleGroups.length > 0;
  // 全部展开着才显示「全部折叠」；全部折叠或有开有合时都显示「全部展开」
  const allExpanded = collapsibleGroups.every((group) => !isGroupCollapsed(group));
  const showHideEmpty = context === "detail" && emptyCount > 0;

  const isShown = (entry: TIssueFieldPlacement) => !(hiddenEmpty && isEmpty(entry.field_id));
  /** columns 不传时字段不带占列类，由网格自己决定每格多宽（长文本区） */
  const renderFields = (entries: TIssueFieldPlacement[], columns?: number) =>
    entries.map((entry) => {
      const field = fieldMap.get(entry.field_id);
      if (!field) return null;
      return (
        <div
          key={entry.field_id}
          data-layout-field={entry.field_id}
          tabIndex={-1}
          hidden={!isShown(entry)}
          className={cn("min-w-0 outline-offset-2", columns && layoutFieldClass(entry.width, columns))}
        >
          {renderField(field, entry, () => clearFieldError(entry.field_id))}
          {serverErrors[entry.field_id] && (
            <p role="alert" className="mt-1 text-12 text-danger-primary">
              {serverErrors[entry.field_id]}
            </p>
          )}
        </div>
      );
    });
  const renderGroup = (group: TIssueLayoutGroup) => {
    const collapsed = isGroupCollapsed(group);
    const unfilled = group.fields.filter((entry) => isEmpty(entry.field_id));
    const missing = unfilled.filter((entry) => fieldMap.get(entry.field_id)?.is_required).length;
    const toggle = () =>
      update((previous) => ({
        ...previous,
        collapsed: { ...previous.collapsed, [group.id]: !collapsed },
      }));
    const isLong = (entry: TIssueFieldPlacement) => {
      const field = fieldMap.get(entry.field_id);
      return !!field && isLongLayoutField(field);
    };
    // 短字段按布局设定的每行字段数排网格；长文本不和短字段混排，统一放到卡片下半部
    const shorts = group.fields.filter((entry) => !isLong(entry));
    const longs = group.fields.filter(isLong);
    const hasShorts = shorts.some(isShown);
    const hasLongs = longs.some(isShown);
    return (
      <section key={group.id} className="overflow-hidden rounded-lg border border-subtle">
        {/* 点整条标题栏都能收起；键盘操作走右侧箭头按钮 */}
        <div
          className={cn(
            "flex min-h-[42px] items-center gap-2.5 bg-surface-2 px-4 py-2 text-14",
            !collapsed && "border-b border-subtle",
            group.collapsible && "cursor-pointer select-none"
          )}
          onClick={group.collapsible ? toggle : undefined}
        >
          <span className="min-w-0 flex-1 font-semibold break-words text-primary">{group.name}</span>
          {context !== "detail" && missing > 0 && (
            <button
              type="button"
              className="shrink-0 text-13 text-danger-primary"
              onClick={(event) => {
                event.stopPropagation();
                const target = missingRequired.find((item) => item.group.id === group.id);
                if (target) openField(target.entry.field_id);
              }}
            >
              {missing} 项必填待补充
            </button>
          )}
          <FillProgress filled={group.fields.length - unfilled.length} total={group.fields.length} />
          {group.collapsible && (
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-controls={`${id}-group-${group.id}`}
              aria-label={`${collapsed ? "展开" : "收起"}${group.name}`}
              className="-mr-1.5 grid size-7 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-1"
              onClick={(event) => {
                event.stopPropagation();
                toggle();
              }}
            >
              <ChevronDown className={cn("size-4 transition-transform", collapsed && "-rotate-90")} />
            </button>
          )}
        </div>
        <div id={`${id}-group-${group.id}`} hidden={collapsed} className="flex flex-col gap-3.5 px-4 pt-3.5 pb-4">
          {shorts.length > 0 && (
            <div hidden={!hasShorts} className={cn("grid gap-x-5 gap-y-3.5", layoutGridClass(group.columns))}>
              {renderFields(shorts, group.columns)}
            </div>
          )}
          {longs.length > 0 && (
            <div
              hidden={!hasLongs}
              className={cn(
                "grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-3",
                hasShorts && "border-t border-dashed border-subtle pt-3.5"
              )}
            >
              {renderFields(longs)}
            </div>
          )}
          {hiddenEmpty && unfilled.length > 0 && (
            <button
              type="button"
              onClick={() => update((previous) => ({ ...previous, showEmpty: true }))}
              className="flex w-full items-baseline gap-1.5 rounded-md bg-warning-subtle px-3 py-2 text-left text-13 text-warning-primary hover:opacity-90"
            >
              <span className="shrink-0 font-medium">未填写 {unfilled.length} 项：</span>
              <span className="min-w-0 text-primary">
                {unfilled.map((entry) => fieldMap.get(entry.field_id)?.name ?? "").join("、")}
              </span>
            </button>
          )}
        </div>
      </section>
    );
  };

  const toolbar = (hasCollapsible || showHideEmpty) && (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {hasCollapsible && (
        <button
          type="button"
          className={TOOLBAR_BUTTON_CLASS}
          onClick={() =>
            update((previous) => ({
              ...previous,
              collapsed: Object.fromEntries(collapsibleGroups.map((group) => [group.id, allExpanded])),
            }))
          }
        >
          {allExpanded ? "全部折叠" : "全部展开"}
        </button>
      )}
      {showHideEmpty && (
        <button
          type="button"
          className={TOOLBAR_BUTTON_CLASS}
          onClick={() => update((previous) => ({ ...previous, showEmpty: !previous.showEmpty }))}
        >
          {hiddenEmpty ? (
            <>
              显示未填 <span className="font-medium text-warning-primary tabular-nums">{emptyCount}</span>
            </>
          ) : (
            "隐藏未填"
          )}
        </button>
      )}
    </div>
  );
  const showTitle = !!title && locations.length > 0;
  // 没有标题行、页面页签又是最上面一行时，操作并到页签行右侧，不再单独占一行
  const toolbarInTabs = !showTitle && navigation.length > 0 && rootGroups.length === 0;

  return (
    <div ref={rootRef} className="@container/layout min-w-0 space-y-3.5">
      {showTitle ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-14 font-semibold text-primary">
            {title}
            <FillProgress filled={locations.length - emptyCount} total={locations.length} />
          </div>
          {toolbar}
        </div>
      ) : (
        !toolbarInTabs && toolbar
      )}
      {rootGroups.map(renderGroup)}
      {navigation.length > 0 && (
        <div className="flex items-center gap-4 border-b border-subtle">
          <div
            role="tablist"
            aria-label="工作项业务页面"
            className="flex min-w-0 flex-1 gap-5 overflow-x-auto"
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const index = navigation.findIndex((page) => page.id === selectedPage);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? navigation.length - 1
                    : (index + (event.key === "ArrowRight" ? 1 : -1) + navigation.length) % navigation.length;
              setActivePage(navigation[next].id);
              (event.currentTarget.children[next] as HTMLElement)?.focus();
            }}
          >
            {navigation.map((page) => (
              <button
                key={page.id}
                type="button"
                role="tab"
                id={`${id}-tab-${page.id}`}
                aria-controls={`${id}-page-${page.id}`}
                aria-selected={selectedPage === page.id}
                tabIndex={selectedPage === page.id ? 0 : -1}
                onClick={() => setActivePage(page.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-1 py-2.5 text-14",
                  selectedPage === page.id
                    ? "border-accent-primary font-medium text-accent-primary"
                    : "border-transparent text-secondary"
                )}
              >
                {page.name}
                {pageCount(page.id) > 0 && <span className="text-12 text-tertiary">{pageCount(page.id)}</span>}
                {context !== "detail" && pageMissing(page.id) > 0 && (
                  <span className="text-12 text-danger-primary" aria-label={`${pageMissing(page.id)} 项必填待补充`}>
                    · {pageMissing(page.id)}
                  </span>
                )}
              </button>
            ))}
          </div>
          {toolbarInTabs && toolbar}
        </div>
      )}
      {pages.map((page) => (
        <div
          key={page.id}
          id={`${id}-page-${page.id}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${page.id}`}
          hidden={selectedPage !== page.id}
          className="space-y-3.5"
        >
          {pageGroups.get(page.id)?.map(renderGroup)}
        </div>
      ))}
      {locations.length === 0 && <p className="py-4 text-13 text-secondary">当前场景没有可展示的自定义字段</p>}
    </div>
  );
}
