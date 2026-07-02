import useSWR from "swr";
import { releasenoteService } from "../services/releasenote.service";

const LATEST_RELEASENOTE_VERSION = "LATEST_RELEASENOTE_VERSION";

export const useLatestReleasenoteVersion = () => {
  const { data, isLoading } = useSWR(LATEST_RELEASENOTE_VERSION, () => releasenoteService.getLatestReleasenote(), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });

  return { isLoading, latestVersion: data?.version || null };
};
