import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, getButtonStyling } from "@plane/propel/button";
import { ControllerInput } from "@/components/common/controller-input";
import { InstanceService } from "@plane/services";

// Initialize service
const instanceService = new InstanceService();

type LdapConfigFormValues = {
  server_url: string;
  base_dn: string;
  bind_dn: string;
  bind_password: string;
  user_search_filter: string;
};

export function InstanceLdapConfigForm() {
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const {
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LdapConfigFormValues>({
    defaultValues: {
      server_url: "",
      base_dn: "",
      bind_dn: "",
      bind_password: "",
      user_search_filter: "(mail=%(user)s)",
    },
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await instanceService.getLdapConfig();
        if (data && Object.keys(data).length > 0) {
          reset(data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, [reset]);

  const onSubmit = async (data: LdapConfigFormValues) => {
    try {
      await instanceService.updateLdapConfig(data);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "LDAP configuration updated successfully",
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Failed to update LDAP configuration",
      });
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    const formData = watch();
    try {
      await instanceService.testLdapConnection(formData);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "LDAP connection successful",
      });
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: error?.message || "LDAP connection failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading configuration...</div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <ControllerInput
          control={control}
          name="server_url"
          label="Server URL"
          placeholder="ldap://10.32.232.191:389"
          type="text"
          error={Boolean(errors.server_url)}
          required={true}
        />
        <ControllerInput
          control={control}
          name="base_dn"
          label="Base DN"
          placeholder="dc=example,dc=com"
          type="text"
          error={Boolean(errors.base_dn)}
          required={true}
        />
        <ControllerInput
          control={control}
          name="bind_dn"
          label="Bind DN"
          placeholder="cn=admin,dc=example,dc=com"
          type="text"
          error={Boolean(errors.bind_dn)}
          required={true}
        />
        <ControllerInput
          control={control}
          name="bind_password"
          label="Bind Password"
          placeholder="******"
          type="password"
          error={Boolean(errors.bind_password)}
          required={true}
        />
        <ControllerInput
          control={control}
          name="user_search_filter"
          label="User Search Filter"
          placeholder="(mail=%(user)s)"
          description="Filter to search for users. Default: (mail=%(user)s)"
          type="text"
          error={Boolean(errors.user_search_filter)}
          required={false}
        />
      </div>

      <div className="flex items-center gap-4 border-t border-custom-border-100 pt-5">
        <Button variant="primary" type="submit" loading={isSubmitting}>
          Save Changes
        </Button>
        <Button variant="neutral-primary" type="button" onClick={handleTestConnection} loading={isTesting}>
          Test Connection
        </Button>
      </div>
    </form>
  );
}
