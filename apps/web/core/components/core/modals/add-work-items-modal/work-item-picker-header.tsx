/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { CalendarDays, Rocket, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CycleIcon, ModuleIcon } from "@plane/propel/icons";
import { renderFormattedDate } from "@plane/utils";
import { useCycle } from "@/hooks/store/use-cycle";
import { useModule } from "@/hooks/store/use-module";
import { useRelease } from "@/hooks/store/use-release";
import type { TWorkItemPickerKind } from "./use-work-item-picker";

const I18N = "work_item_picker";

const dateRange = (start?: string | null, end?: string | null) => {
  const from = renderFormattedDate(start, "MM/dd");
  const to = renderFormattedDate(end, "MM/dd");
  if (!from && !to) return undefined;
  return `${from ?? "—"} – ${to ?? "—"}`;
};

/** 标题 + 「加到哪儿」：迭代 / 模块显示起止日期，发布显示计划发布日 */
export const WorkItemPickerHeader = observer(function WorkItemPickerHeader(props: {
  kind: TWorkItemPickerKind;
  targetId: string;
  onClose: () => void;
}) {
  const { kind, targetId, onClose } = props;
  const { t } = useTranslation();
  const { getCycleById } = useCycle();
  const { getReleaseById } = useRelease();
  const { getModuleById } = useModule();

  let icon: ReactNode = null;
  let name: string | undefined;
  let meta: string | undefined;
  if (kind === "cycle") {
    const cycle = getCycleById(targetId);
    icon = <CycleIcon className="size-3.5 shrink-0 text-placeholder" />;
    name = cycle?.name;
    meta = dateRange(cycle?.start_date, cycle?.end_date);
  } else if (kind === "release") {
    const release = getReleaseById(targetId);
    const date = renderFormattedDate(release?.target_date, "MM/dd");
    icon = <Rocket className="size-3.5 shrink-0 text-placeholder" />;
    name = release?.name;
    meta = date ? t(`${I18N}.release_target_date`, { date }) : undefined;
  } else {
    const module = getModuleById(targetId);
    icon = <ModuleIcon className="size-3.5 shrink-0 text-placeholder" />;
    name = module?.name;
    meta = dateRange(module?.start_date, module?.target_date);
  }

  return (
    <div className="flex shrink-0 items-start gap-4 px-5 pt-5 pb-3 sm:px-7">
      <div className="min-w-0 flex-1">
        <h2 className="text-18 leading-7 font-semibold text-primary">{t(`${I18N}.title.${kind}`)}</h2>
        {name && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-13 whitespace-nowrap text-tertiary">
            {icon}
            <span className="min-w-0 truncate font-medium text-secondary">{name}</span>
            {meta && (
              <>
                <span className="mx-1.5 h-3 w-px shrink-0 bg-layer-3" />
                <CalendarDays className="size-3.5 shrink-0 text-placeholder" />
                <span className="shrink-0 tabular-nums">{meta}</span>
              </>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={t("close")}
        className="-mr-2 grid size-8 shrink-0 place-items-center rounded-md text-placeholder hover:bg-layer-1 hover:text-secondary"
        onClick={onClose}
      >
        <X className="size-4.5" />
      </button>
    </div>
  );
});
