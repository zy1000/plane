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
import { InfoIcon } from "@plane/propel/icons";
import type { IProject } from "@plane/types";
// helpers
import { getTabIndex } from "@plane/utils";

type Props = {
  handleClose: () => void;
  isMobile?: boolean;
};

/** 创建弹窗页脚：左侧一句「ID 与可见性创建后可改」的提示，右侧取消 / 创建 */
function ProjectCreateButtons(props: Props) {
  const { t } = useTranslation();
  const { handleClose, isMobile = false } = props;
  const {
    formState: { isSubmitting },
  } = useFormContext<IProject>();

  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);

  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-subtle px-8 py-4">
      <p className="flex min-w-0 items-center gap-1.5 text-12 text-tertiary">
        <InfoIcon className="size-3.5 shrink-0" />
        <span className="truncate">{t("workspace_projects.create.footer_hint")}</span>
      </p>
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
