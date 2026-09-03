/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import useKeypress from "@/hooks/use-keypress";
// plane web components
import { CreateProjectForm } from "@/plane-web/components/projects/create/root";
// plane web types
import type { TProject } from "@/plane-web/types/projects";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  setToFavorite?: boolean;
  workspaceSlug: string;
  data?: Partial<TProject>;
  templateId?: string;
};

export function CreateProjectModal(props: Props) {
  const { isOpen, onClose, setToFavorite = false, workspaceSlug, data, templateId } = props;
  const router = useRouter();
  const initialFocusRef = useRef<HTMLInputElement | null>(null);

  /**
   * 创建完成直接关闭弹窗并跳转到新项目，不再展示特性选择步骤。
   * 所有特性开关已在创建接口默认值里置为开启。
   */
  const handleProjectCreated = (projectId: string) => {
    onClose();
    if (projectId) {
      router.push(`/${workspaceSlug}/projects/${projectId}/issues`);
    }
  };

  useKeypress("Escape", () => {
    if (isOpen) onClose();
  });

  return (
    <ModalCore
      isOpen={isOpen}
      position={EModalPosition.TOP}
      width={EModalWidth.XXXXL}
      // 设计稿 800px、16px 圆角；EModalWidth 没有 50rem 档，用 className 覆盖
      className="rounded-2xl sm:max-w-[50rem]"
      initialFocus={initialFocusRef}
    >
      {isOpen && (
        <CreateProjectForm
          setToFavorite={setToFavorite}
          workspaceSlug={workspaceSlug}
          onClose={onClose}
          handleNextStep={handleProjectCreated}
          data={data}
          templateId={templateId}
          initialFocusRef={initialFocusRef}
        />
      )}
    </ModalCore>
  );
}
