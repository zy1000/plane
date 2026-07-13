import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import type { TRequirementModule } from "@/services/requirement.service";

type Props = {
  isOpen: boolean;
  modules: TRequirementModule[];
  isMutating: boolean;
  onCreate: (name: string) => Promise<unknown>;
  onUpdate: (moduleId: string, name: string) => Promise<unknown>;
  onDelete: (moduleId: string) => Promise<void>;
  onClose: () => void;
  onChanged: () => void;
};

export function RequirementModuleManagerModal(props: Props) {
  const { isMutating, isOpen, modules, onChanged, onClose, onCreate, onDelete, onUpdate } = props;
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deletingModule, setDeletingModule] = useState<TRequirementModule | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setNewName("");
      setEditingId(null);
      setEditingName("");
    }
  }, [isOpen]);

  const showError = (error: any) => {
    const duplicate = Array.isArray(error?.name) && error.name.includes("REQUIREMENT_MODULE_NAME_ALREADY_EXISTS");
    setToast({
      type: TOAST_TYPE.ERROR,
      title: "操作失败",
      message: duplicate ? "当前产品已存在同名模块。" : (error?.error ?? "请稍后重试。"),
    });
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await onCreate(name);
      setNewName("");
      onChanged();
    } catch (error) {
      showError(error);
    }
  };

  const update = async () => {
    const name = editingName.trim();
    if (!editingId || !name) return;
    try {
      await onUpdate(editingId, name);
      setEditingId(null);
      setEditingName("");
      onChanged();
    } catch (error) {
      showError(error);
    }
  };

  return (
    <>
      <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
        <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
          <div>
            <h2 className="text-16 font-semibold text-primary">管理需求模块</h2>
            <p className="mt-0.5 text-11 text-tertiary">模块在当前产品的用户需求和研发需求间共享</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1.5 hover:bg-layer-1">
            <CloseIcon className="size-4 text-secondary" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="新模块名称"
              className="h-9 flex-1"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void create();
                }
              }}
            />
            <Button
              type="button"
              variant="primary"
              size="lg"
              prependIcon={<Plus className="size-4" />}
              disabled={!newName.trim()}
              loading={isMutating && !editingId}
              onClick={() => void create()}
            >
              添加
            </Button>
          </div>

          <div className="mt-4 max-h-80 divide-y divide-subtle overflow-y-auto rounded-md border border-subtle">
            {modules.length === 0 ? (
              <div className="px-4 py-10 text-center text-12 text-tertiary">还没有需求模块</div>
            ) : (
              modules.map((module) => (
                <div key={module.id} className="flex min-h-11 items-center gap-2 px-3 py-2 hover:bg-layer-1">
                  {editingId === module.id ? (
                    <Input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className="h-8 flex-1"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-13 font-medium text-primary">{module.name}</span>
                  )}
                  {editingId === module.id ? (
                    <>
                      <Button type="button" variant="ghost" size="sm" onClick={() => void update()}>
                        <Check className="size-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        <X className="size-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(module.id);
                          setEditingName(module.name);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeletingModule(module)}>
                        <Trash2 className="size-3.5 text-danger-primary" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </ModalCore>

      <AlertModalCore
        isOpen={!!deletingModule}
        title="删除需求模块"
        content={`删除“${deletingModule?.name ?? ""}”后，使用该模块的需求会变为未分配模块。`}
        isSubmitting={isMutating}
        handleClose={() => setDeletingModule(null)}
        handleSubmit={async () => {
          if (!deletingModule) return;
          try {
            await onDelete(deletingModule.id);
            setDeletingModule(null);
            onChanged();
          } catch (error) {
            showError(error);
          }
        }}
      />
    </>
  );
}
