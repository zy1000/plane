/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IProject } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// services
import { IssueSchemeService } from "@/services/project/issue-scheme.service";
import { ViewService } from "@/services/view.service";

const issueSchemeService = new IssueSchemeService();
const viewService = new ViewService();

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  project: IProject;
  devModeName?: string;
  onClose: () => void;
};

/**
 * 切换为项目自定义（单向，docs/issue-scheme/ 5.3）：拷一份当前模式的工作项配置到项目名下，
 * 之后研发模式的修改不再影响本项目，且不能改回跟随。要输入项目标识符确认。
 *
 * 成功后整页刷新：类型 / 状态 / 字段的 id 都换成了新方案的，各处项目级缓存（类型、扩展字段、
 * 状态 store、SWR）一起失效最稳。
 */
export function IssueSchemeDetachModal({ isOpen, workspaceSlug, project, devModeName, onClose }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = confirmText.trim().toUpperCase() === project.identifier?.toUpperCase();
  // 研发模式视图会拷成本项目的公共视图，弹窗里写清有几个
  const { data: modeViews } = useSWR(
    isOpen ? `PROJECT_MODE_VIEWS_${workspaceSlug}_${project.id}` : null,
    () => viewService.getProjectModeViews(workspaceSlug, project.id),
    { revalidateOnFocus: false }
  );
  const modeViewCount = modeViews?.length ?? 0;

  const handleClose = () => {
    if (isSubmitting) return;
    setConfirmText("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await issueSchemeService.detachProjectIssueScheme(workspaceSlug, project.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "已切换为项目自定义",
        message: "本项目的工作项配置不再跟随研发模式，页面即将刷新。",
      });
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      const payload = error as { error?: string } | undefined;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "切换失败",
        message: payload?.error ?? "请稍后重试。",
      });
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-center gap-4">
          <span className="rounded-full bg-warning-subtle p-3">
            <AlertTriangle className="size-5 text-warning-primary" aria-hidden="true" />
          </span>
          <h3 className="text-18 font-medium text-primary">切换为项目自定义</h3>
        </div>
        <div className="flex flex-col gap-2 text-13 leading-6 text-secondary">
          <p>
            会把研发模式{devModeName ? `「${devModeName}」` : ""}当前的工作项类型、自定义属性、状态和工作流拷一份到本项目，之后：
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>研发模式里的修改不再同步到本项目，配置要在本项目里自己维护；</li>
            <li>已有工作项的类型、状态、属性值保持不变；</li>
            {modeViewCount > 0 && <li>研发模式的 {modeViewCount} 个视图拷成本项目的公共视图，页签位置不变；</li>}
            <li className="font-medium text-primary">切换后不能改回跟随研发模式。</li>
          </ul>
        </div>
        <div className="text-13 text-secondary">
          <p>
            输入项目标识符 <span className="font-medium text-primary">{project.identifier}</span> 确认：
          </p>
          <Input
            id="issue-scheme-detach-confirm"
            name="issue-scheme-detach-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={project.identifier}
            className="mt-2 w-full"
            autoComplete="off"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="error-fill" size="lg" onClick={handleSubmit} disabled={!canSubmit} loading={isSubmitting}>
            {isSubmitting ? "切换中" : "确认切换"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
