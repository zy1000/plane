/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
// hooks
import { useProjectStage } from "@/hooks/store/use-project-stage";

type Props = {
  handleRemove: (val: string) => void;
  values: string[];
  editable: boolean | undefined;
};

/** 已应用的「所属阶段」筛选 chip：显示阶段名，"None" 显示「无阶段」 */
export const AppliedStageFilters = observer(function AppliedStageFilters(props: Props) {
  const { handleRemove, values, editable } = props;
  const { t } = useTranslation();
  const { getStageById } = useProjectStage();

  return (
    <>
      {values.map((stageId) => {
        const label = stageId === "None" ? t("stage_field.no_stage") : (getStageById(stageId)?.name ?? stageId);
        return (
          <div key={stageId} className="flex items-center gap-1 rounded-sm bg-layer-1 px-1.5 py-1 text-11">
            {label}
            {editable && (
              <button
                type="button"
                className="grid place-items-center text-tertiary hover:text-secondary"
                onClick={() => handleRemove(stageId)}
              >
                <CloseIcon height={10} width={10} strokeWidth={2} />
              </button>
            )}
          </div>
        );
      })}
    </>
  );
});
