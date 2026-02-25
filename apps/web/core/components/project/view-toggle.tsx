"use client";

import { observer } from "mobx-react";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@plane/utils";
import { useProjectFilter } from "@/hooks/store/use-project-filter";

type Props = {
  className?: string;
};

export const ProjectsViewToggle = observer(function ProjectsViewToggle(props: Props) {
  const { className = "" } = props;
  const { viewMode, updateViewMode } = useProjectFilter();

  return (
    <div className={cn("flex items-center rounded border border-custom-border-200 bg-custom-background-100", className)}>
      <button
        type="button"
        className={cn(
          "grid place-items-center rounded-l px-2 py-2 text-custom-text-400 transition-colors hover:bg-custom-background-80",
          {
            "bg-custom-background-80 text-custom-text-200": viewMode === "card",
          }
        )}
        aria-pressed={viewMode === "card"}
        onClick={() => updateViewMode("card")}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={cn(
          "grid place-items-center rounded-r px-2 py-2 text-custom-text-400 transition-colors hover:bg-custom-background-80",
          {
            "bg-custom-background-80 text-custom-text-200": viewMode === "list",
          }
        )}
        aria-pressed={viewMode === "list"}
        onClick={() => updateViewMode("list")}
      >
        <List className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

