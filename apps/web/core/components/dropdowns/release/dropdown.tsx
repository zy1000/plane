import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useRelease } from "@/hooks/store/use-release";
import type { TDropdownProps } from "../types";
import { ReleaseDropdownBase } from "./base";

type TReleaseDropdownProps = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  projectId: string | undefined;
  showCount?: boolean;
  onClose?: () => void;
  renderByDefault?: boolean;
  itemClassName?: string;
} & (
    | {
        multiple: false;
        onChange: (val: string | null) => void;
        value: string | null;
      }
    | {
        multiple: true;
        onChange: (val: string[]) => void;
        value: string[] | null;
      }
  );

export const ReleaseDropdown = observer(function ReleaseDropdown(props: TReleaseDropdownProps) {
  const { projectId } = props;
  const { workspaceSlug } = useParams();
  const { getReleaseById, getProjectReleaseIds, fetchReleases } = useRelease();
  const releaseIds = projectId ? getProjectReleaseIds(projectId) : [];

  const onDropdownOpen = () => {
    if (!releaseIds && projectId && workspaceSlug) fetchReleases(workspaceSlug.toString(), projectId);
  };

  return (
    <ReleaseDropdownBase
      {...props}
      getReleaseById={getReleaseById}
      releaseIds={releaseIds ?? []}
      onDropdownOpen={onDropdownOpen}
    />
  );
});
