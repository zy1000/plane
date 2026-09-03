import { ArrowRight, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Badge } from "@plane/propel/badge";
import { Button } from "@plane/propel/button";
import type { TExternalIntegration } from "@plane/types";
import { renderFormattedDateTime } from "@plane/utils";
import {
  INTEGRATIONS_I18N as I18N,
  formatSyncSummary,
  getIntegrationDescription,
  getIntegrationErrorLabel,
  getIntegrationName,
  getProviderLabel,
} from "./helpers";

type Props = {
  workspaceSlug: string;
  integration: TExternalIntegration;
  canSync: boolean;
  isSyncing: boolean;
  /** toast 在 root 里统一做，这里只触发 */
  onSync: (key: string) => Promise<void>;
};

const CODE_CLASS = "rounded bg-layer-3 px-1.5 py-0.5 font-mono text-caption-sm-regular text-primary";

export function IntegrationCard(props: Props) {
  const { workspaceSlug, integration, canSync, isSyncing, onSync } = props;
  const { t } = useTranslation();
  const { target, remote, last_sync: lastSync } = integration;
  const providerLabel = getProviderLabel(integration.provider, t);

  const renderLastSync = () => {
    if (!lastSync) return <span className="text-tertiary">{t(`${I18N}.card.never_synced`)}</span>;
    const who = lastSync.triggered_by?.display_name ?? t(`${I18N}.card.by_schedule`);
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-secondary">
          {renderFormattedDateTime(lastSync.finished_at)} · {who}
        </span>
        {lastSync.status === "success" && lastSync.summary ? (
          <span className="text-success-primary">{formatSyncSummary(lastSync.summary, t)}</span>
        ) : (
          <span className="text-danger-primary">
            {getIntegrationErrorLabel(lastSync.error?.code, t)}
            {lastSync.error?.detail ? `（${lastSync.error.detail}）` : ""}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border border-subtle bg-layer-2 px-4 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-body-sm-medium text-primary">{getIntegrationName(integration, t)}</h4>
          <Badge variant="brand" size="sm">
            {providerLabel}
          </Badge>
          <Badge variant="neutral" size="sm">
            {t(`${I18N}.direction.${integration.direction}`)}
          </Badge>
          <Badge variant={integration.is_configured ? "success" : "warning"} size="sm">
            {t(`${I18N}.card.${integration.is_configured ? "configured" : "not_configured"}`)}
          </Badge>
        </div>
        <p className="text-caption-md-regular text-tertiary">{getIntegrationDescription(integration, t)}</p>
        <dl className="grid gap-x-6 gap-y-1.5 text-caption-md-regular sm:grid-cols-[max-content_minmax(0,1fr)]">
          <dt className="text-tertiary">{t(`${I18N}.card.mapping`)}</dt>
          <dd className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-secondary">
            <span>{providerLabel}</span>
            {remote?.field && <code className={CODE_CLASS}>{remote.field}</code>}
            <ArrowRight className="size-3.5 shrink-0 text-tertiary" aria-hidden />
            {target?.dictionary_id ? (
              <Link to={`/${workspaceSlug}/settings/data-dictionaries`} className="text-accent-primary hover:underline">
                {t(`${I18N}.card.mapping_to`, { name: target.dictionary_name ?? target.dictionary_key })}
              </Link>
            ) : (
              <span>{t(`${I18N}.card.target_missing`)}</span>
            )}
            {target?.dictionary_id && (
              <span className="text-tertiary">{t(`${I18N}.card.target_count`, { count: target.item_count })}</span>
            )}
          </dd>
          {!integration.is_configured && (
            <>
              <dt className="text-tertiary">{t(`${I18N}.card.config`)}</dt>
              <dd className="flex flex-wrap items-center gap-1.5 text-secondary">
                <span>{t(`${I18N}.card.missing_settings`)}</span>
                {integration.missing_settings.map((name) => (
                  <code key={name} className={CODE_CLASS}>
                    {name}
                  </code>
                ))}
              </dd>
            </>
          )}
          <dt className="text-tertiary">{t(`${I18N}.card.last_sync`)}</dt>
          <dd>{renderLastSync()}</dd>
        </dl>
      </div>
      <div className="shrink-0">
        <Button
          variant="primary"
          size="sm"
          prependIcon={<RefreshCw />}
          loading={isSyncing}
          disabled={!canSync || !integration.is_configured}
          onClick={() => void onSync(integration.key)}
        >
          {t(`${I18N}.card.${isSyncing ? "syncing" : "sync_now"}`)}
        </Button>
      </div>
    </div>
  );
}
