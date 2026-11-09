import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import type { TIssueExtraFieldValue } from "@plane/types";
import { cn } from "@plane/utils";
import { useIssueLayoutPreferences } from "@/hooks/use-issue-layout-preferences";
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";
import type {
  TIssueFieldPlacement,
  TIssueLayoutContext,
  TStoredIssueTypeFieldLayout,
} from "@/services/project/issue-type-layout.types";
import {
  ISSUE_LAYOUT_ERROR_EVENT,
  ISSUE_LAYOUT_VALIDATE_EVENT,
  layoutFieldsForContext,
  layoutFieldSpan,
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
  renderField: (field: TTypeExtraField, placement: TIssueFieldPlacement, clearError: () => void) => ReactNode;
};
const EMPTY_VALUES: TIssueExtraFieldValue[] = [];

/** All pages remain mounted so changing tabs or collapsing a group preserves drafts. */
export function IssueFieldLayout({
  layout,
  fields,
  values = EMPTY_VALUES,
  context,
  preferenceKey,
  issueId,
  errors = {},
  validationAttempt = 0,
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
  const pages = useMemo(
    () => layoutFieldsForContext(resolved, fields, context, errorKey.split(",")),
    [resolved, fields, context, errorKey]
  );
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const isEmpty = (fieldId: string) => isValueEmpty(findValueForField(values, fieldId));
  const hiddenEmpty = context === "detail" && preferences.hideEmpty;
  const locations = pages.flatMap((page) =>
    page.groups.flatMap((group) => group.fields.map((entry) => ({ page, group, entry })))
  );
  const missingRequired = locations.filter(
    ({ entry }) => fieldMap.get(entry.field_id)?.is_required && isEmpty(entry.field_id)
  );
  const selectedPage = pages.some((page) => page.id === activePage) ? activePage : pages[0]?.id;
  const openField = useCallback(
    (fieldId: string) => {
      const location = pages
        .flatMap((page) => page.groups.map((group) => ({ page, group })))
        .find(({ group }) => group.fields.some((entry) => entry.field_id === fieldId));
      if (!location) return;
      setActivePage(location.page.id);
      update((previous) => ({
        ...previous,
        hideEmpty: false,
        collapsed: { ...previous.collapsed, [location.group.id]: false },
      }));
      setFocusField(fieldId);
      setAttempt((value) => value + 1);
    },
    [pages, update]
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
      element?.scrollIntoView({ block: "nearest", behavior: "auto" });
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
    window.addEventListener(ISSUE_LAYOUT_VALIDATE_EVENT, validate);
    window.addEventListener(ISSUE_LAYOUT_ERROR_EVENT, receiveError);
    return () => {
      window.removeEventListener(ISSUE_LAYOUT_VALIDATE_EVENT, validate);
      window.removeEventListener(ISSUE_LAYOUT_ERROR_EVENT, receiveError);
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
  const pageMissing = (pageId: string) => missingRequired.filter(({ page }) => page.id === pageId).length;
  const pageCount = (pageId: string) => locations.filter(({ page }) => page.id === pageId).length;
  const navigation = pages.map((page) => ({ id: page.id, name: page.name }));

  return (
    <div ref={rootRef} className="@container/layout min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-3 text-12 text-secondary">
        <button
          type="button"
          onClick={() =>
            update((previous) => ({
              ...previous,
              collapsed: Object.fromEntries(pages.flatMap((page) => page.groups.map((group) => [group.id, false]))),
            }))
          }
        >
          全部展开
        </button>
        {context === "detail" && emptyCount > 0 && (
          <button
            type="button"
            className="flex items-center gap-1"
            onClick={() => update((previous) => ({ ...previous, hideEmpty: !previous.hideEmpty }))}
          >
            {hiddenEmpty ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {hiddenEmpty ? `显示未填 ${emptyCount}` : "隐藏未填"}
          </button>
        )}
      </div>
      {navigation.length > 0 && (
        <div
          role="tablist"
          aria-label="工作项业务页面"
          className="flex gap-5 overflow-x-auto border-b border-subtle"
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
      )}
      <div className="@container/layout min-w-0 space-y-4">
        {pages.map((page) => (
          <div
            key={page.id}
            id={`${id}-page-${page.id}`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${page.id}`}
            hidden={selectedPage !== page.id}
            className="space-y-4"
          >
            {page.groups.map((group) => {
              const collapsed = group.collapsible && (preferences.collapsed[group.id] ?? group.default_collapsed);
              const missing = group.fields.filter(
                (entry) => fieldMap.get(entry.field_id)?.is_required && isEmpty(entry.field_id)
              ).length;
              const filled = group.fields.filter((entry) => !isEmpty(entry.field_id)).length;
              return (
                <section key={group.id} className="border-b border-subtle pb-4">
                  <div className="flex min-h-9 items-center justify-between gap-3 text-14">
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      aria-controls={`${id}-group-${group.id}`}
                      disabled={!group.collapsible}
                      className="flex min-w-0 flex-1 items-center gap-2 py-3 text-left font-medium text-primary"
                      onClick={() =>
                        update((previous) => ({
                          ...previous,
                          collapsed: { ...previous.collapsed, [group.id]: !collapsed },
                        }))
                      }
                    >
                      {group.collapsible &&
                        (collapsed ? (
                          <ChevronRight className="size-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="size-3.5 shrink-0" />
                        ))}
                      <span className="break-words">{group.name}</span>
                      <span className="text-12 text-tertiary">{group.fields.length}</span>
                    </button>
                    {context !== "detail" && missing > 0 ? (
                      <button
                        type="button"
                        className="shrink-0 text-12 text-danger-primary"
                        onClick={() => {
                          const target = missingRequired.find((item) => item.group.id === group.id);
                          if (target) openField(target.entry.field_id);
                        }}
                      >
                        {missing} 项必填待补充
                      </button>
                    ) : (
                      collapsed && (
                        <span className="shrink-0 text-12 text-tertiary">
                          已填 {filled} / {group.fields.length}
                        </span>
                      )
                    )}
                  </div>
                  <div id={`${id}-group-${group.id}`} hidden={collapsed}>
                    <div className="grid grid-cols-6 gap-x-6 gap-y-4 pt-2 pl-5">
                      {group.fields.map((entry) => {
                        const field = fieldMap.get(entry.field_id);
                        if (!field) return null;
                        return (
                          <div
                            key={entry.field_id}
                            data-layout-field={entry.field_id}
                            tabIndex={-1}
                            hidden={hiddenEmpty && isEmpty(entry.field_id)}
                            className={cn("min-w-0 py-1 outline-offset-2", layoutFieldSpan(entry.width, group.columns))}
                          >
                            {renderField(field, entry, () => clearFieldError(entry.field_id))}
                            {serverErrors[entry.field_id] && (
                              <p role="alert" className="mt-1 text-12 text-danger-primary">
                                {serverErrors[entry.field_id]}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {hiddenEmpty && filled === 0 && (
                      <p className="px-2 py-3 text-13 text-tertiary">此分组暂无已填字段，可通过「显示未填」查看。</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ))}
        {pages.length === 0 && <p className="py-4 text-13 text-secondary">当前场景没有可展示的自定义字段</p>}
      </div>
    </div>
  );
}
