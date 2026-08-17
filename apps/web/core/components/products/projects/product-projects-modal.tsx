import { useEffect, useMemo, useState } from "react";
import { xor } from "lodash-es";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TLogoProps, TProductProject } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

export type TProductProjectCandidate = {
  id: string;
  name: string;
  identifier: string;
  logo_props?: TLogoProps;
  created_at?: Date | string | null;
};

type TProps = {
  isOpen: boolean;
  projects: TProductProjectCandidate[];
  isProjectsLoading: boolean;
  links: TProductProject[];
  isSubmitting: boolean;
  handleClose: () => void;
  onSubmit: (payload: { projects: string[]; removed_projects: string[] }) => Promise<void>;
};

export const ProductProjectsModal = (props: TProps) => {
  const { isOpen, projects, isProjectsLoading, links, isSubmitting, handleClose, onSubmit } = props;
  const { t } = useTranslation();

  const linkedIds = useMemo(() => links.map((link) => link.project), [links]);
  const [selectedIds, setSelectedIds] = useState<string[]>(linkedIds);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(linkedIds);
      setSearchQuery("");
    }
  }, [isOpen, linkedIds]);

  const unlinkedProjects = useMemo(
    () => projects.filter((project) => !linkedIds.includes(project.id)),
    [linkedIds, projects]
  );

  const filteredProjects = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return unlinkedProjects;
    return unlinkedProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(keyword) || project.identifier.toLowerCase().includes(keyword)
    );
  }, [searchQuery, unlinkedProjects]);

  const toggle = (projectId: string) =>
    setSelectedIds((current) =>
      current.includes(projectId) ? current.filter((item) => item !== projectId) : [...current, projectId]
    );

  const handleSubmit = async () => {
    const changed = xor(linkedIds, selectedIds);
    if (!changed.length) {
      handleClose();
      return;
    }
    const added: string[] = [];
    const removed: string[] = [];
    for (const projectId of changed) {
      if (linkedIds.includes(projectId)) removed.push(projectId);
      else added.push(projectId);
    }

    try {
      await onSubmit({ projects: added, removed_projects: removed });
      handleClose();
    } catch (error) {
      const payload = error as { error?: string; code?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message:
          payload?.code === "PRODUCT_HAS_LINKED_REQUIREMENTS"
            ? t("workspace_products.projects.has_linked_requirements")
            : (payload?.error ?? t("error")),
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXXXL}>
      <div className="border-b border-subtle px-5 py-4">
        <h3 className="text-body-sm-semibold text-primary">{t("workspace_products.projects.link")}</h3>
        <label className="relative mt-3 block">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-placeholder" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("workspace_products.projects.search_placeholder")}
            className="focus:border-accent-primary h-8 w-full rounded-md border border-subtle bg-surface-1 pr-8 pl-8 text-12 text-primary outline-none placeholder:text-placeholder"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-secondary hover:bg-layer-2 hover:text-primary"
            >
              <CloseIcon className="size-3.5" />
            </button>
          )}
        </label>
      </div>

      <div className="max-h-[min(32rem,60vh)] overflow-y-auto px-3 py-2">
        {isProjectsLoading ? (
          <Loader className="space-y-2 p-2">
            <Loader.Item height="40px" />
            <Loader.Item height="40px" />
            <Loader.Item height="40px" />
          </Loader>
        ) : unlinkedProjects.length === 0 ? (
          <p className="px-3 py-8 text-center text-13 text-secondary">
            {t("workspace_products.projects.no_visible_projects")}
          </p>
        ) : filteredProjects.length === 0 ? (
          <p className="px-3 py-8 text-center text-13 text-secondary">
            {t("workspace_products.projects.no_match")}
          </p>
        ) : (
          filteredProjects.map((project) => {
            const isSelected = selectedIds.includes(project.id);
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => toggle(project.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md border-[0.5px] border-transparent px-3 py-2.5 text-left text-13 text-primary transition-colors",
                  "hover:bg-layer-transparent-hover",
                  isSelected && "border-accent-strong bg-accent-primary/5"
                )}
              >
                <Checkbox checked={isSelected} onChange={() => toggle(project.id)} />
                <span className="grid size-4 shrink-0 place-items-center">
                  <Logo logo={project.logo_props} size={14} />
                </span>
                <span className="min-w-0 truncate">{project.name}</span>
                {project.identifier && (
                  <span className="shrink-0 rounded bg-layer-2 px-1.5 py-0.5 text-11 text-secondary">
                    {project.identifier}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" size="lg" onClick={handleClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="lg"
          loading={isSubmitting}
          disabled={isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {t("confirm")}
        </Button>
      </div>
    </ModalCore>
  );
};
