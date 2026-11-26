import { useEffect, useState } from "react";
import { Copy, FilePlus2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TCreateRequirementTypePayload, TRequirementType } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import {
  getRandomTypeIconOption,
  getTypeIconOption,
  TypeIconPicker,
  toTypeIconProps,
} from "@/components/common/type-icon-picker";
import type { TTypeIconOption } from "@/components/common/type-icon-picker";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: TCreateRequirementTypePayload) => Promise<TRequirementType>;
  onCreated: (requirementType: TRequirementType) => void;
  isSubmitting: boolean;
  /** 复制模式：名称、图标从这个类型带出，onCreate 由调用方接到复制接口 */
  copySource?: TRequirementType | null;
  /** 复制模式下预填的名称 */
  copyName?: string;
};

/** 纯 props 驱动，不依赖模板管理的 context —— 那个 provider 以后要删。 */
export function RequirementTypeCreateModal(props: Props) {
  const { isOpen, onClose, onCreate, onCreated, isSubmitting, copySource, copyName } = props;
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 先随机给一套，比让所有新类型长得一模一样好认
  const [iconOption, setIconOption] = useState<TTypeIconOption>(getRandomTypeIconOption);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  // 关闭动画期间调用方已把 copySource 清空，标题不该闪回「新建」：关着的时候沿用上一次打开时的来源
  const [lastSource, setLastSource] = useState<TRequirementType | null>(null);
  const source = isOpen ? (copySource ?? null) : lastSource;

  useEffect(() => {
    if (!isOpen) return;
    setLastSource(copySource ?? null);
    setName(copySource ? (copyName ?? copySource.name) : "");
    setError(null);
    setIconOption(copySource ? getTypeIconOption(copySource.logo_props?.icon) : getRandomTypeIconOption());
    setIsIconPickerOpen(false);
  }, [isOpen, copySource, copyName]);

  const handleCreate = async () => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError(t("workspace_templates.requirement_types.validation.name_required"));
      return;
    }
    setError(null);
    try {
      onCreated(await onCreate({ name: normalizedName, logo_props: { icon: toTypeIconProps(iconOption) } }));
    } catch (requestError) {
      const payload = requestError as { name?: string[]; error?: string };
      setError(payload?.name?.[0] ?? payload?.error ?? t("workspace_templates.requirement_types.toast.failed"));
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="flex items-center justify-between gap-3 border-b border-subtle px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-layer-2 text-secondary">
            {source ? <Copy className="size-4" /> : <FilePlus2 className="size-4" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-14 font-medium text-primary">
              {source ? "复制需求模板" : t("workspace_templates.requirement_types.create")}
            </h2>
            <p className="truncate text-11 text-secondary">
              {source
                ? `复制「${source.name}」的说明与字段配置，创建一个新模板。`
                : t("workspace_templates.requirement_types.create_description")}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
          onClick={onClose}
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-4 px-5 py-5">
        <div className="block">
          <span className="mb-1.5 block text-12 font-medium text-secondary">
            {t("workspace_templates.requirement_types.fields.name")}
          </span>
          {/* 图标与名称同属「这个类型是什么」，排在一行 —— 与工作项类型的创建弹窗同构 */}
          <div className="relative flex items-center gap-2">
            <TypeIconPicker
              value={iconOption}
              isOpen={isIconPickerOpen}
              onChange={setIconOption}
              onToggle={setIsIconPickerOpen}
              buttonClassName="border border-subtle bg-surface-1"
            />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              className="focus:border-accent-primary h-9 min-w-0 flex-1 rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder"
              placeholder={t("workspace_templates.requirement_types.fields.name_placeholder")}
            />
          </div>
        </div>
        {error && <p className="text-11 text-danger-primary">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={() => void handleCreate()} loading={isSubmitting}>
          {source ? "复制并配置" : t("workspace_templates.requirement_types.create_and_edit")}
        </Button>
      </div>
    </ModalCore>
  );
}
