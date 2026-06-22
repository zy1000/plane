import type { FC } from "react";
import { observer } from "mobx-react";
import { DefectListRoot } from "./defect-list-root";

export const ProjectDefectsRoot: FC = observer(() => (
  <div className="flex h-full w-full flex-col bg-surface-1">
    <div className="min-h-0 flex-1">
      <DefectListRoot />
    </div>
  </div>
));
