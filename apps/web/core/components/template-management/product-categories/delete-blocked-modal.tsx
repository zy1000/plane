import { Link } from "react-router";
import { AlertCircle, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TProductCategoryLibrary } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { TypeIcon } from "@/components/common/type-icon-picker";

export type TDeleteBlocked = {
  name: string;
  description: string;
  libraries: { id: string; name: string; summary?: string }[];
};

type Props = {
  workspaceSlug: string;
  /** null = 关着 */
  blocked: TDeleteBlocked | null;
  /** 分类上带的在用库，用来给库补上需求类型图标 */
  categoryLibraries: TProductCategoryLibrary[];
  onClose: () => void;
};

/** 删除被拦（分类在用 / 一级模块下还有内容）：列出相关标准库，点库名直接去处理 */
export function DeleteBlockedModal({ workspaceSlug, blocked, categoryLibraries, onClose }: Props) {
  const { t } = useTranslation();
  const logoById = new Map(categoryLibraries.map((library) => [library.id, library.requirement_type_detail?.logo_props]));

  return (
    <ModalCore isOpen={blocked !== null} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="flex gap-3.5 px-6 pt-6 pb-[18px]">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-subtle text-danger-primary">
          <AlertCircle className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
          <h3 className="text-16 font-semibold text-primary">
            {t("product_categories.blocked.title", { name: blocked?.name ?? "" })}
          </h3>
          <p className="text-13 leading-5 text-secondary">{blocked?.description}</p>
        </div>
      </div>
      <div className="mx-6 overflow-hidden rounded-[10px] border border-subtle">
        {blocked?.libraries.map((library) => (
          <Link
            key={library.id}
            to={`/${workspaceSlug}/templates/libraries/${library.id}`}
            onClick={onClose}
            className="flex h-[46px] items-center gap-2.5 border-b border-subtle px-3.5 transition-colors last:border-b-0 hover:bg-layer-1-hover"
          >
            <TypeIcon
              iconProps={logoById.get(library.id)?.icon}
              className="size-[26px] rounded-[7px] bg-layer-1"
              iconClassName="size-3.5"
            />
            <span className="min-w-0 flex-1 truncate text-14 text-primary">{library.name}</span>
            {library.summary && <span className="shrink-0 text-12 text-secondary">{library.summary}</span>}
            <ChevronRight className="size-3.5 shrink-0 text-tertiary" />
          </Link>
        ))}
      </div>
      <div className="flex justify-end px-6 pt-[18px] pb-5">
        <Button variant="secondary" size="xl" className="px-3" onClick={onClose}>
          {t("product_categories.blocked.ok")}
        </Button>
      </div>
    </ModalCore>
  );
}
