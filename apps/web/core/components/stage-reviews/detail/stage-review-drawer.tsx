import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { Transition } from "@headlessui/react";
import type { TStageReview } from "@plane/types";
import { cn } from "@plane/utils";
import { StageReviewDetailRoot } from "./stage-review-detail-root";
import type { TStageReviewPeekMode } from "./stage-review-peek-mode";
import { STAGE_REVIEW_PEEK_PANEL_CLASS } from "./stage-review-peek-mode";

/**
 * 评审详情抽屉：遮罩 + 面板的外壳，内容是 `StageReviewDetailRoot`（独立详情页也用它）。
 *
 * 摆法照工作项 peek 有三种（侧边 / 居中 / 全屏），头一行关闭按钮旁切换；侧边模式比工作项抽屉
 * 宽一档（2xl 下 70%）—— 这一屏要同时铺开正文与 312px 的属性栏。模式记在组件里，同一页里
 * 换一条评审不会跳回侧边。头一行还有「在新页面中打开」，去独立详情页。
 *
 * `projectId` 永远是**这条评审自己的项目**：产品页里一屏评审横跨多个项目，所有读写都要打到
 * 评审所在项目的端点上。`showProjectCrumb` 给产品页用：面包屑第一段换成项目名，右侧多一个
 * 「在项目中打开」。
 */
export const StageReviewDrawer = ({
  workspaceSlug,
  workspaceId,
  projectId,
  reviewId,
  canManage,
  currentUserId,
  showProjectCrumb = false,
  onClose,
  onUpdated,
}: {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  reviewId: string | null;
  canManage: boolean;
  /** 推进 / 退回只认负责人、审核者本人，按钮要拿它判断能不能点 */
  currentUserId: string | undefined;
  showProjectCrumb?: boolean;
  onClose: () => void;
  onUpdated: (review: TStageReview) => void;
}) => {
  const [peekMode, setPeekMode] = useState<TStageReviewPeekMode>("side-peek");
  const isOpen = Boolean(reviewId);

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
              STAGE_REVIEW_PEEK_PANEL_CLASS[peekMode]
            )}
          >
            <StageReviewDetailRoot
              variant="drawer"
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              projectId={projectId}
              reviewId={reviewId}
              canManage={canManage}
              currentUserId={currentUserId}
              showProjectCrumb={showProjectCrumb}
              peekMode={peekMode}
              onPeekModeChange={setPeekMode}
              onClose={onClose}
              onUpdated={onUpdated}
            />
          </div>
        </Transition.Child>
      </div>
    </Transition>,
    portalContainer
  );
};
