import { useState, useEffect } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
// icons
import { Settings2 } from "lucide-react";
// plane internal packages
import { getButtonStyling } from "@plane/propel/button";
import type { TInstanceAuthenticationMethodKeys } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { InstanceService } from "@plane/services";

const instanceService = new InstanceService();

type Props = {
  disabled: boolean;
  updateConfig: (key: TInstanceAuthenticationMethodKeys, value: string) => void;
};

export const LdapConfiguration = observer(function LdapConfiguration(props: Props) {
  const { disabled } = props;
  const [config, setConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await instanceService.getLdapConfig();
        setConfig(data);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleToggle = async () => {
    if (!config) return;
    try {
      const newValue = !config.is_active;
      // Optimistic update
      setConfig({ ...config, is_active: newValue });
      await instanceService.updateLdapConfig({ is_active: newValue });
    } catch (error) {
      console.error(error);
      // Revert on error
      setConfig({ ...config, is_active: !config.is_active });
    }
  };

  if (isLoading) return <div className="h-6 w-12 bg-custom-background-90 rounded animate-pulse" />;

  const isConfigured = config && config.server_url;
  const isActive = config?.is_active ?? false;

  return (
    <>
      {isConfigured ? (
        <div className="flex items-center gap-4">
          <Link href="/authentication/ldap" className={cn(getButtonStyling("link-primary", "md"), "font-medium")}>
            Edit
          </Link>
          <ToggleSwitch
            value={isActive}
            onChange={handleToggle}
            size="sm"
            disabled={disabled}
          />
        </div>
      ) : (
        <Link
          href="/authentication/ldap"
          className={cn(getButtonStyling("neutral-primary", "sm"), "text-custom-text-300")}
        >
          <Settings2 className="h-4 w-4 p-0.5 text-custom-text-300/80" />
          Configure
        </Link>
      )}
    </>
  );
});
