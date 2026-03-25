import { type ServerProviderStatus } from "@t3tools/contracts";
import { memo } from "react";
import { CircleAlertIcon } from "lucide-react";

import { getDefaultProviderStatusMessage, getProviderStatusTitle } from "../../providerStatus";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

export const ProviderHealthBanner = memo(function ProviderHealthBanner({
  status,
}: {
  status: ServerProviderStatus | null;
}) {
  if (!status || status.status === "ready") {
    return null;
  }

  const defaultMessage = getDefaultProviderStatusMessage(status);

  return (
    <div className="pt-3 mx-auto max-w-3xl">
      <Alert variant={status.status === "error" ? "error" : "warning"}>
        <CircleAlertIcon />
        <AlertTitle>{getProviderStatusTitle(status.provider)}</AlertTitle>
        <AlertDescription className="line-clamp-3" title={status.message ?? defaultMessage}>
          {status.message ?? defaultMessage}
        </AlertDescription>
      </Alert>
    </div>
  );
});
