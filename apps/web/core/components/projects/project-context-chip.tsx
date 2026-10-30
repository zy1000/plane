import { Briefcase } from "lucide-react";

/** 弹窗小标题旁的项目标记：从项目页打开产品 / 需求弹窗时，说明这条记录会落到哪个项目 */
export const ProjectContextChip = ({ name }: { name: string }) => (
  <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2 text-12 font-medium text-secondary">
    <Briefcase className="size-3.5 shrink-0 text-tertiary" />
    <span className="truncate" title={name}>
      {name}
    </span>
  </span>
);
