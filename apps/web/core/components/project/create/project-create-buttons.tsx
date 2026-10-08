/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useFormContext } from "react-hook-form";
// plane imports
import { ETabIndices } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IProject } from "@plane/types";
// helpers
import { getTabIndex } from "@plane/utils";
// components
import { RequiredStatus } from "@/components/common/form-modal";

type Props = {
  handleClose: () => void;
  isMobile?: boolean;
  requiredFilled: number;
  requiredTotal: number;
};

/** 创建弹窗页脚：左侧必填进度，右侧取消 / 创建 */
function ProjectCreateButtons(props: Props) {
  const { t } = useTranslation();
  const { handleClose, isMobile = false, requiredFilled, requiredTotal } = props;
  const {
    formState: { isSubmitting, errors },
  } = useFormContext<IProject>();

  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);

  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-subtle px-7 py-3.5 md:pl-9">
      <RequiredStatus filled={requiredFilled} total={requiredTotal} hasErrors={Object.keys(errors).length > 0} />
      <div className="ml-auto flex shrink-0 gap-2.5">
        <Button variant="secondary" size="lg" onClick={handleClose} tabIndex={getIndex("cancel")}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" size="lg" type="submit" loading={isSubmitting} tabIndex={getIndex("submit")}>
          {isSubmitting ? t("creating") : t("create_project")}
        </Button>
      </div>
    </div>
  );
}

export default ProjectCreateButtons;
