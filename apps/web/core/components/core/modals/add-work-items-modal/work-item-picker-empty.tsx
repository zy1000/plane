/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Inbox, Rocket, SearchX } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CycleIcon } from "@plane/propel/icons";
import type { TWorkItemPickerKind } from "./use-work-item-picker";

const I18N = "work_item_picker.empty";

/**
 * 可添加页签没有结果：有关键词时提示可按编号搜；迭代 / 发布没打开范围开关时，
 * 给一个按钮直接打开「包含已在其他迭代中的」再查一次。
 */
export const WorkItemPickerEmpty = (props: {
  kind: TWorkItemPickerKind;
  query: string;
  narrowed: boolean;
  includeOther: boolean;
  projectIdentifier: string;
  onIncludeOther: () => void;
}) => {
  const { kind, query, narrowed, includeOther, projectIdentifier, onIncludeOther } = props;
  const { t } = useTranslation();
  const canWiden = kind !== "module" && !includeOther;
  const WidenIcon = kind === "release" ? Rocket : CycleIcon;

  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center gap-2.5 px-6 pb-10 text-center">
      <span className="mb-1.5 grid size-14 place-items-center rounded-2xl bg-layer-1 text-placeholder">
        {query ? <SearchX className="size-6" /> : <Inbox className="size-6" />}
      </span>
      <h3 className="text-16 font-semibold text-primary">
        {query ? t(`${I18N}.search_title`, { query }) : t(`${I18N}.title`)}
      </h3>
      <p className="text-13 leading-[22px] text-tertiary">
        {query && t(`${I18N}.search_hint`, { identifier: projectIdentifier })}
        {!query && narrowed && t(`${I18N}.filter_hint`)}
        {canWiden && (
          <>
            {(query || narrowed) && <br />}
            {t(`${I18N}.scope_hint.${kind}`)}
          </>
        )}
      </p>
      {canWiden && (
        <button
          type="button"
          className="mt-2 flex h-9 items-center gap-1.5 rounded-lg border border-subtle bg-surface-1 px-3.5 text-13 font-medium text-primary hover:bg-layer-1"
          onClick={onIncludeOther}
        >
          <WidenIcon className="size-3.5 text-placeholder" />
          {t(`${I18N}.find_in_other.${kind}`)}
        </button>
      )}
    </div>
  );
};
