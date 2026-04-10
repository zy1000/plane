import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Button, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useReleasenoteModal } from "../hooks/use-releasenote-modal";
import { useUser } from "@/hooks/store/user";
import type { TReleasenoteUpdateType } from "../types";

const UPDATE_TYPE_CONFIG: Record<TReleasenoteUpdateType, { label: string; className: string }> = {
  added: {
    label: "新功能",
    className: "bg-green-500/10 text-green-600",
  },
  improved: {
    label: "改进",
    className: "bg-blue-500/10 text-blue-600",
  },
  fixed: {
    label: "修复",
    className: "bg-amber-500/10 text-amber-600",
  },
};

type Props = {
  workspaceSlug: string;
};

export const ReleasenoteModal = ({ workspaceSlug }: Props) => {
  const router = useRouter();
  const { data: currentUser } = useUser();
  const { currentWorkspace } = useWorkspace();
  const { isOpen, latest, closeModal } = useReleasenoteModal({
    userId: currentUser?.id,
  });

  const handleViewDetail = async () => {
    await closeModal();
    router.push(`/${workspaceSlug}/releasenote`);
  };

  const typeConfig = latest?.update_type ? UPDATE_TYPE_CONFIG[latest.update_type] : null;

  const formattedDate = latest?.release_date
    ? new Date(latest.release_date).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <ModalCore isOpen={isOpen} handleClose={closeModal} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="flex max-h-[80vh] flex-col overflow-hidden">
        {/* 顶部渐变装饰 */}
        <div className="h-1 w-full flex-shrink-0 bg-gradient-to-r from-accent-primary via-purple-500 to-pink-500" />

        {/* 头部 */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-0 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-primary/10">
              <Sparkles className="h-4.5 w-4.5 text-accent-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-medium uppercase tracking-wider text-secondary">更新日志</p>
                {latest?.version && (
                  <span className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-[11px] font-semibold text-accent-primary">
                    v{latest.version}
                  </span>
                )}
                {typeConfig && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${typeConfig.className}`}>
                    {typeConfig.label}
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 text-lg font-semibold leading-snug text-primary">{latest?.title}</h3>
              {formattedDate && <p className="mt-1 text-xs text-tertiary">{formattedDate}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface-3 hover:text-primary cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 摘要 */}
        {latest?.summary && (
          <div className="mx-6 mt-3 flex-shrink-0">
            <p className="text-sm leading-relaxed text-secondary">{latest.summary}</p>
          </div>
        )}

        {/* 内容区域 */}
        <div className="mx-6 mt-4 min-h-0 flex-1 overflow-y-auto">
          <div className="rounded-lg border border-subtle-1 bg-surface-2/50 p-3">
            <RichTextEditor
              id={`releasenote-modal-content-${latest?.id ?? "latest"}`}
              editable={false}
              initialValue={latest?.content || latest?.description || ""}
              workspaceSlug={workspaceSlug}
              workspaceId={currentWorkspace?.id ?? ""}
            />
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-subtle px-6 py-4 mt-4">
          <Button variant="neutral-primary" size="sm" onClick={closeModal}>
            关闭
          </Button>
          <Button variant="primary" size="sm" onClick={handleViewDetail} appendIcon={<ArrowRight className="h-3.5 w-3.5" />}>
            查看详情
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
