import { useCallback } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TExternalIntegration, TExternalIntegrationSyncResponse } from "@plane/types";
import { Loader } from "@plane/ui";
import { SettingsHeading } from "@/components/settings/heading";
import { INTEGRATIONS_I18N as I18N, formatSyncSummary, getIntegrationErrorMessage } from "./helpers";
import { IntegrationCard } from "./integration-card";

type Props = {
  workspaceSlug: string;
  canSync: boolean;
  integrations: TExternalIntegration[];
  isLoading: boolean;
  error: string | null;
  syncingKey: string | null;
  fetchIntegrations: () => Promise<TExternalIntegration[]>;
  syncIntegration: (key: string) => Promise<TExternalIntegrationSyncResponse>;
};

/** 第三方集成设置页正文。纯 props 组件，状态来自 use-external-integrations。 */
export function IntegrationsRoot(props: Props) {
  const { workspaceSlug, canSync, integrations, isLoading, error, syncingKey, fetchIntegrations, syncIntegration } =
    props;
  const { t } = useTranslation();

  // 卡片的「上次同步」由 hook 就地更新（成功 / 失败都带回 integration），这里只负责 toast
  const handleSync = useCallback(
    async (key: string) => {
      try {
        const response = await syncIntegration(key);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t(`${I18N}.toast.synced`),
          message: response.result.summary ? formatSyncSummary(response.result.summary, t) : undefined,
        });
      } catch (requestError) {
        setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: getIntegrationErrorMessage(requestError, t) });
      }
    },
    [syncIntegration, t]
  );

  const renderBody = () => {
    if (isLoading && integrations.length === 0) {
      return (
        <Loader className="flex flex-col gap-4">
          <Loader.Item height="140px" width="100%" />
        </Loader>
      );
    }

    if (error && integrations.length === 0) {
      return (
        <div className="rounded-lg border border-subtle p-10 text-center">
          <p className="text-13 font-medium text-primary">{t(`${I18N}.toast.load_failed`)}</p>
          <p className="mt-1 text-12 text-secondary">{error}</p>
          <Button className="mt-3" variant="secondary" onClick={() => void fetchIntegrations().catch(() => undefined)}>
            {t("retry")}
          </Button>
        </div>
      );
    }

    if (integrations.length === 0) {
      return (
        <div className="rounded-lg border border-subtle p-10 text-center text-13 text-secondary">
          {t(`${I18N}.empty`)}
        </div>
      );
    }

    return integrations.map((integration) => (
      <IntegrationCard
        key={integration.key}
        workspaceSlug={workspaceSlug}
        integration={integration}
        canSync={canSync}
        isSyncing={syncingKey === integration.key}
        onSync={handleSync}
      />
    ));
  };

  return (
    <>
      <SettingsHeading title={t(`${I18N}.title`)} description={t(`${I18N}.description`)} />
      <div className="mt-6 flex w-full flex-col gap-4">{renderBody()}</div>
    </>
  );
}
