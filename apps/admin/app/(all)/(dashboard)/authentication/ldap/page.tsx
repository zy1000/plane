import { useState, useEffect } from "react";
import { observer } from "mobx-react";
import { BookUser } from "lucide-react";
import { Loader, ToggleSwitch } from "@plane/ui";
import { AuthenticationMethodCard } from "@/components/authentication/authentication-method-card";
import { InstanceService } from "@plane/services";
import { InstanceLdapConfigForm } from "./form";
import type { Route } from "../+types/page";

const instanceService = new InstanceService();

const InstanceLdapAuthenticationPage = observer(function InstanceLdapAuthenticationPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchConfig = async () => {
    try {
      const data = await instanceService.getLdapConfig();
      setConfig(data || {});
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleToggle = async () => {
    if (!config) return;
    setIsSubmitting(true);
    try {
      const newValue = !config.is_active;
      await instanceService.updateLdapConfig({ is_active: newValue });
      setConfig({ ...config, is_active: newValue });
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="relative container mx-auto w-full h-full p-4 py-4 space-y-6 flex flex-col">
        <div className="border-b border-custom-border-100 mx-4 py-4 space-y-1 flex-shrink-0">
          <AuthenticationMethodCard
            name="LDAP"
            description="Allow members to login or sign up to plane with their LDAP accounts."
            icon={<BookUser className="h-6 w-6 p-0.5 text-custom-text-300/80" />}
            config={
              <ToggleSwitch
                value={config?.is_active ?? false}
                onChange={handleToggle}
                size="sm"
                disabled={isSubmitting || isLoading}
              />
            }
            disabled={isSubmitting || isLoading}
            withBorder={false}
          />
        </div>
        <div className="flex-grow overflow-hidden overflow-y-scroll vertical-scrollbar scrollbar-md px-4">
          {isLoading ? (
            <Loader className="space-y-8">
              <Loader.Item height="50px" width="25%" />
              <Loader.Item height="50px" />
              <Loader.Item height="50px" />
              <Loader.Item height="50px" />
              <Loader.Item height="50px" width="50%" />
            </Loader>
          ) : (
            <InstanceLdapConfigForm />
          )}
        </div>
      </div>
    </>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "LDAP Authentication - God Mode" }];

export default InstanceLdapAuthenticationPage;
