import { useState } from "react";
import { observer } from "mobx-react";
import { LayoutGrid, Package, Plus, Trash2 } from "lucide-react";
import { Input } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TRequirementModule } from "@/services/requirement.service";

type TRequirementModuleSidebarProps = {
  modules: TRequirementModule[];
  total: number;
  selectedModuleId: string;
  isLoading: boolean;
  isMutating: boolean;
  onSelect: (moduleId: string) => void;
  onDeleteModule: (module: TRequirementModule) => void;
  onCreateModule: (name: string) => Promise<boolean>;
};

type TModuleRowProps = {
  icon: typeof Package;
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  onDelete?: () => void;
};

function ModuleRow(props: TModuleRowProps) {
  const { icon: Icon, label, count, isActive, onClick, onDelete } = props;
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-13 transition-colors",
          isActive ? "bg-accent-subtle text-accent-primary" : "text-secondary hover:bg-layer-1"
        )}
      >
        <Icon className={cn("size-4 shrink-0", isActive ? "text-accent-primary" : "text-tertiary")} />
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-11 tabular-nums transition-opacity",
            onDelete && "group-hover:opacity-0",
            isActive ? "bg-accent-subtle-hover text-accent-primary" : "bg-layer-1 text-tertiary"
          )}
        >
          {count}
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label={`删除模块 ${label}`}
          className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-placeholder opacity-0 transition-opacity hover:bg-layer-1 hover:text-danger-primary focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export const RequirementModuleSidebar = observer(function RequirementModuleSidebar(
  props: TRequirementModuleSidebarProps
) {
  const { modules, total, selectedModuleId, isLoading, isMutating, onSelect, onDeleteModule, onCreateModule } = props;
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const cancelAdding = () => {
    setIsAdding(false);
    setNewName("");
  };

  const submitNewModule = async () => {
    const name = newName.trim();
    if (!name || isMutating) return;
    const created = await onCreateModule(name);
    if (created) cancelAdding();
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-hidden border-r border-subtle bg-surface-1">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-11 font-medium uppercase tracking-wide text-tertiary">模块</span>
        <button
          type="button"
          onClick={() => {
            setNewName("");
            setIsAdding(true);
          }}
          aria-label="新增模块"
          className="grid size-5 place-items-center rounded text-tertiary transition-colors hover:bg-layer-1 hover:text-secondary"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-3">
        {isAdding && (
          <div className="px-0.5 pb-1">
            <Input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="新模块名称"
              className="h-8 w-full text-13"
              disabled={isMutating}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitNewModule();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelAdding();
                }
              }}
              onBlur={() => {
                if (!newName.trim()) cancelAdding();
              }}
            />
          </div>
        )}
        <ModuleRow
          icon={LayoutGrid}
          label="全部"
          count={total}
          isActive={!selectedModuleId}
          onClick={() => onSelect("")}
        />
        {isLoading && modules.length === 0 ? (
          <div className="space-y-1 pt-1">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-9 animate-pulse rounded-md bg-layer-1" />
            ))}
          </div>
        ) : modules.length === 0 ? (
          <p className="px-2.5 py-4 text-12 text-tertiary">还没有模块</p>
        ) : (
          modules.map((module) => (
            <ModuleRow
              key={module.id}
              icon={Package}
              label={module.name}
              count={module.requirement_count}
              isActive={selectedModuleId === module.id}
              onClick={() => onSelect(module.id)}
              onDelete={() => onDeleteModule(module)}
            />
          ))
        )}
      </div>
    </aside>
  );
});
