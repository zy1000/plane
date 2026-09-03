/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { ETabIndices } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
// plane ui
import { getTabIndex } from "@plane/utils";
// plane web imports
import { ProjectTemplateSelect } from "@/plane-web/components/projects/create/template-select";

type Props = {
  handleClose: () => void;
  isMobile?: boolean;
  isClosable?: boolean;
  handleTemplateSelect?: () => void;
  showActionButtons?: boolean;
};

/** 创建弹窗标题栏：标题 + 关闭按钮（logo 选择器在名称输入框左侧，不再有封面图） */
function ProjectCreateHeader(props: Props) {
  const { handleClose, isMobile = false, isClosable = true, handleTemplateSelect, showActionButtons = true } = props;
  const { t } = useTranslation();
  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);

  return (
    <div className="flex items-center justify-between gap-3 border-b border-subtle px-7 py-4">
      <div className="flex items-center gap-3">
        <h3 className="text-16 font-semibold text-primary">{t("create_project")}</h3>
        {showActionButtons && <ProjectTemplateSelect onClick={handleTemplateSelect} />}
      </div>
      {isClosable && (
        <button
          type="button"
          onClick={handleClose}
          tabIndex={getIndex("close")}
          className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
          aria-label={t("close")}
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

export default ProjectCreateHeader;
