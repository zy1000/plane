/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Transition } from "@headlessui/react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import type {
  TUserWorkConfig,
  TUserWorkConfigPatch,
  TUserWorkPendingGroupBy,
  TUserWorkPendingOrderBy,
  TUserWorkProcessedDays,
  TUserWorkProcessedGroupBy,
  TUserWorkType,
} from "@/types/user-work";
import { USER_WORK_TYPES } from "@/types/user-work";
import { WORK_TYPE_ICON, WORK_TYPE_ORDER, workTypeLabel } from "./work-types";

type TView = "pending" | "processed";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  config: TUserWorkConfig;
  /** 每类当前条数（待处理按全部来源算；已处理按时间范围内），显示在开关旁 */
  pendingCounts: Partial<Record<TUserWorkType, number>>;
  processedCounts?: Partial<Record<TUserWorkType, number>>;
  initialView?: TView;
  onSave: (patch: TUserWorkConfigPatch) => Promise<unknown>;
};

const PENDING_GROUP_OPTIONS: TUserWorkPendingGroupBy[] = ["type", "owner", "due_date", "none"];
const PENDING_ORDER_OPTIONS: TUserWorkPendingOrderBy[] = ["due_date", "created_at"];
const PROCESSED_GROUP_OPTIONS: TUserWorkProcessedGroupBy[] = ["date", "type", "owner", "none"];
const DAYS_OPTIONS: TUserWorkProcessedDays[] = [7, 30, 90];

const DEFAULT_OFF: TUserWorkType[] = ["case_execution", "case_review", "plan_review"];

const defaultSources = () =>
  Object.fromEntries(USER_WORK_TYPES.map((type) => [type, !DEFAULT_OFF.includes(type)])) as Record<TUserWorkType, boolean>;

const DEFAULT_CONFIG: TUserWorkConfig = {
  pending: { sources: defaultSources(), group_by: "type", order_by: "due_date", overdue_first: true },
  processed: { sources: defaultSources(), days: 30, group_by: "date" },
};

/**
 * 「视图设置」右侧抽屉：待处理 / 已处理两段，各自勾选工作来源 + 默认显示。
 * 显式「保存」才写回，关掉即丢弃（正式系统的交互，不做开关即存）。
 */
export function ViewSettingsDrawer({ isOpen, onClose, config, pendingCounts, processedCounts, initialView = "pending", onSave }: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<TView>(initialView);
  const [draft, setDraft] = useState<TUserWorkConfig>(config);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(config);
      setView(initialView);
    }
  }, [config, initialView, isOpen]);

  const portalContainer = typeof document !== "undefined" ? document.getElementById("full-screen-portal") : null;
  if (!portalContainer) return null;

  const sources = draft[view].sources;
  const enabledCount = WORK_TYPE_ORDER.filter((type) => sources[type]).length;
  const counts = view === "pending" ? pendingCounts : (processedCounts ?? {});

  const setSource = (type: TUserWorkType, value: boolean) =>
    setDraft((current) => ({
      ...current,
      [view]: { ...current[view], sources: { ...current[view].sources, [type]: value } },
    }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ pending: draft.pending, processed: draft.processed });
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("profile.work.settings.saved") });
      onClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("profile.work.settings.save_failed") });
    } finally {
      setIsSaving(false);
    }
  };

  const groupLabel = (key: string) =>
    key === "type"
      ? t("profile.work.groups.by_type")
      : key === "owner"
        ? t("profile.work.groups.by_owner")
        : key === "due_date"
          ? t("profile.work.groups.by_due")
          : key === "date"
            ? t("profile.work.groups.by_date")
            : t("profile.work.groups.none");
  const orderLabel = (key: TUserWorkPendingOrderBy) =>
    key === "due_date" ? t("profile.work.display.order_due") : t("profile.work.display.order_created");
  const daysLabel = (days: TUserWorkProcessedDays) => t(`profile.work.time_range.days_${days}`);

  const selectButtonClass = "h-8 min-w-[200px] justify-between rounded-md border border-subtle px-3 text-13";

  return createPortal(
    <Transition show={isOpen} as={Fragment}>
      <div className="absolute inset-0 z-[25]">
        <Transition.Child
          as={Fragment}
          enter="transition-opacity duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="absolute inset-0 bg-black/25" onClick={onClose} />
        </Transition.Child>
        <Transition.Child
          as={Fragment}
          enter="transition-transform duration-200 ease-out"
          enterFrom="translate-x-full"
          enterTo="translate-x-0"
          leave="transition-transform duration-150 ease-in"
          leaveFrom="translate-x-0"
          leaveTo="translate-x-full"
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t("profile.work.settings.title")}
            className="absolute top-0 right-0 bottom-0 flex w-full flex-col border-l border-subtle bg-surface-1 shadow-overlay-200 md:w-[520px]"
          >
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-subtle pr-3 pl-6">
              <h2 className="text-16 font-semibold text-primary">{t("profile.work.settings.title")}</h2>
              <Button variant="ghost" size="lg" onClick={onClose} aria-label={t("profile.work.settings.cancel")}>
                <CloseIcon className="size-4" />
              </Button>
            </header>

            <div className="mx-6 mt-4 flex gap-0.5 rounded-lg bg-layer-1 p-0.5" role="tablist">
              {(["pending", "processed"] as TView[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={view === key}
                  onClick={() => setView(key)}
                  className={cn(
                    "h-8 flex-1 rounded-md text-13 font-medium transition-colors",
                    view === key ? "bg-surface-1 text-primary shadow-sm" : "text-secondary hover:text-primary"
                  )}
                >
                  {t(`profile.tabs.${key}`)}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="mt-4 flex h-8 items-center justify-between text-12 font-medium text-tertiary">
                <span>{t("profile.work.settings.sources")}</span>
                <span className="font-normal tabular-nums">
                  {t("profile.work.settings.enabled_count", { enabled: enabledCount, total: WORK_TYPE_ORDER.length })}
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border border-subtle">
                {WORK_TYPE_ORDER.map((type) => {
                  const Icon = WORK_TYPE_ICON[type];
                  const enabled = !!sources[type];
                  return (
                    <div
                      key={type}
                      className="flex h-14 items-center gap-3 border-b border-subtle/60 px-4 last:border-b-0"
                    >
                      <Icon className={cn("size-4 shrink-0", enabled ? "text-tertiary" : "text-placeholder")} />
                      <span className={cn("shrink-0 text-14", enabled ? "font-medium text-primary" : "text-secondary")}>
                        {workTypeLabel(t, type)}
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate text-12", enabled ? "text-tertiary" : "text-placeholder")}>
                        {t(`profile.work.settings.${view}_rules.${type}`)}
                      </span>
                      <span className={cn("w-6 text-right text-13 tabular-nums", enabled ? "text-tertiary" : "text-placeholder")}>
                        {counts[type] ?? 0}
                      </span>
                      <ToggleSwitch value={enabled} onChange={(value) => setSource(type, value)} size="sm" />
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex h-8 items-center text-12 font-medium text-tertiary">
                {t("profile.work.settings.defaults")}
              </div>
              <div className="divide-y divide-subtle/60">
                <div className="flex h-12 items-center justify-between text-14">
                  <span>{t("profile.work.display.group_by")}</span>
                  <CustomSelect
                    value={draft[view].group_by}
                    label={groupLabel(draft[view].group_by)}
                    onChange={(value: string) =>
                      setDraft((current) => ({ ...current, [view]: { ...current[view], group_by: value } }))
                    }
                    buttonClassName={selectButtonClass}
                    placement="bottom-end"
                  >
                    {(view === "pending" ? PENDING_GROUP_OPTIONS : PROCESSED_GROUP_OPTIONS).map((option) => (
                      <CustomSelect.Option key={option} value={option}>
                        {groupLabel(option)}
                      </CustomSelect.Option>
                    ))}
                  </CustomSelect>
                </div>
                {view === "pending" ? (
                  <>
                    <div className="flex h-12 items-center justify-between text-14">
                      <span>{t("profile.work.display.order_by")}</span>
                      <CustomSelect
                        value={draft.pending.order_by}
                        label={orderLabel(draft.pending.order_by)}
                        onChange={(value: TUserWorkPendingOrderBy) =>
                          setDraft((current) => ({ ...current, pending: { ...current.pending, order_by: value } }))
                        }
                        buttonClassName={selectButtonClass}
                        placement="bottom-end"
                      >
                        {PENDING_ORDER_OPTIONS.map((option) => (
                          <CustomSelect.Option key={option} value={option}>
                            {orderLabel(option)}
                          </CustomSelect.Option>
                        ))}
                      </CustomSelect>
                    </div>
                    <div className="flex h-12 items-center justify-between text-14">
                      <span>{t("profile.work.display.overdue_first")}</span>
                      <ToggleSwitch
                        value={draft.pending.overdue_first}
                        onChange={(value) =>
                          setDraft((current) => ({ ...current, pending: { ...current.pending, overdue_first: value } }))
                        }
                        size="sm"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex h-12 items-center justify-between text-14">
                    <span>{t("profile.work.settings.default_time_range")}</span>
                    <CustomSelect
                      value={draft.processed.days}
                      label={daysLabel(draft.processed.days)}
                      onChange={(value: TUserWorkProcessedDays) =>
                        setDraft((current) => ({ ...current, processed: { ...current.processed, days: value } }))
                      }
                      buttonClassName={selectButtonClass}
                      placement="bottom-end"
                    >
                      {DAYS_OPTIONS.map((option) => (
                        <CustomSelect.Option key={option} value={option}>
                          {daysLabel(option)}
                        </CustomSelect.Option>
                      ))}
                    </CustomSelect>
                  </div>
                )}
              </div>
            </div>

            <footer className="flex h-16 shrink-0 items-center justify-between border-t border-subtle px-6">
              <button
                type="button"
                className="text-13 text-secondary hover:text-primary"
                onClick={() => setDraft({ ...DEFAULT_CONFIG, pending: { ...DEFAULT_CONFIG.pending, sources: defaultSources() }, processed: { ...DEFAULT_CONFIG.processed, sources: defaultSources() } })}
              >
                {t("profile.work.settings.reset")}
              </button>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="lg" onClick={onClose}>
                  {t("profile.work.settings.cancel")}
                </Button>
                <Button variant="primary" size="lg" onClick={() => void handleSave()} loading={isSaving}>
                  {t("profile.work.settings.save")}
                </Button>
              </div>
            </footer>
          </aside>
        </Transition.Child>
      </div>
    </Transition>,
    portalContainer
  );
}
