import { useRouter } from "next/navigation";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useReleasenoteModal } from "../hooks/use-releasenote-modal";
import { useUser } from "@/hooks/store/user";

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

  return (
    <ModalCore isOpen={isOpen} handleClose={closeModal} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="flex max-h-[80vh] flex-col p-5">
        <div className="flex-shrink-0">
          <p className="text-sm text-secondary">更新日志</p>
          <h3 className="mt-1 text-lg font-semibold text-primary">{latest?.title}</h3>
          {latest?.summary && <p className="mt-3 text-sm text-primary">{latest.summary}</p>}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="rounded border border-subtle-1 bg-layer-1 p-2">
            <RichTextEditor
              id={`releasenote-modal-content-${latest?.id ?? "latest"}`}
              editable={false}
              initialValue={latest?.content || latest?.description || ""}
              workspaceSlug={workspaceSlug}
              workspaceId={currentWorkspace?.id ?? ""}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-shrink-0 items-center justify-end gap-2 border-t border-subtle pt-4">
          <button
            type="button"
            className="rounded border border-subtle px-3 py-1.5 text-sm text-primary"
            onClick={closeModal}
          >
            关闭
          </button>
          <button
            type="button"
            className="rounded bg-accent-primary px-3 py-1.5 text-sm text-white"
            onClick={handleViewDetail}
          >
            查看详情
          </button>
        </div>
      </div>
    </ModalCore>
  );
};
