import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { Transition } from "@headlessui/react";
import type { TRiskDetail } from "@plane/types";
import { cn } from "@plane/utils";
import { RiskDetailRoot } from "./risk-detail-root";
import type { TRiskPeekMode } from "./risk-peek-mode";
import { RISK_PEEK_PANEL_CLASS } from "./risk-peek-mode";

/**
 * 风险详情抽屉：遮罩 + 面板的外壳，内容是 `RiskDetailRoot`（独立详情页也用它）。
 *
 * 摆法照工作项 peek 有三种（侧边 / 居中 / 全屏），顶栏右侧切换；模式记在组件里，
 * 同一页里换一条风险不会跳回侧边。顶栏还有「在新页面中打开」，去独立详情页。
 */
export const RiskDrawer = ({
  workspaceSlug,
  workspaceId,
  projectId,
  riskId,
  canEdit,
  currentUserId,
  onClose,
  onUpdated,
  onDeleted,
}: {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  riskId: string | null;
  canEdit: boolean;
  /** 评论只有作者本人能删 */
  currentUserId: string | undefined;
  onClose: () => void;
  /** 字段保存成功后回灌列表那一行 */
  onUpdated: (risk: TRiskDetail) => void;
  /** 删除成功后由列表把这一行拿掉并关抽屉 */
  onDeleted: (riskId: string) => void;
}) => {
  const [peekMode, setPeekMode] = useState<TRiskPeekMode>("side-peek");
  const isOpen = Boolean(riskId);

  const portalContainer = typeof document !== "undefined" ? document.getElementById("full-screen-portal") : null;
  if (!portalContainer) return null;

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

        {/* 侧边模式从右滑入；居中 / 全屏没有「边」可滑，改淡入 */}
        <Transition.Child
          as={Fragment}
          enter={peekMode === "side-peek" ? "transition-transform duration-200 ease-out" : "transition-opacity duration-200"}
          enterFrom={peekMode === "side-peek" ? "translate-x-full" : "opacity-0"}
          enterTo={peekMode === "side-peek" ? "translate-x-0" : "opacity-100"}
          leave={peekMode === "side-peek" ? "transition-transform duration-150 ease-in" : "transition-opacity duration-150"}
          leaveFrom={peekMode === "side-peek" ? "translate-x-0" : "opacity-100"}
          leaveTo={peekMode === "side-peek" ? "translate-x-full" : "opacity-0"}
        >
          <div
            className={cn(
              "absolute flex flex-col overflow-hidden border-subtle bg-surface-1 shadow-overlay-200 transition-all duration-300",
              RISK_PEEK_PANEL_CLASS[peekMode]
            )}
          >
            <RiskDetailRoot
              variant="drawer"
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              projectId={projectId}
              riskId={riskId}
              canEdit={canEdit}
              currentUserId={currentUserId}
              peekMode={peekMode}
              onPeekModeChange={setPeekMode}
              onClose={onClose}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          </div>
        </Transition.Child>
      </div>
    </Transition>,
    portalContainer
  );
};
