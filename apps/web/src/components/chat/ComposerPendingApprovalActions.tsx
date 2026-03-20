import { type ApprovalRequestId, type ProviderApprovalDecision } from "@t3tools/contracts";
import { memo } from "react";
import { Button } from "../ui/button";

interface ComposerPendingApprovalActionsProps {
  requestId: ApprovalRequestId;
  isResponding: boolean;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<void>;
}

export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  isResponding,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        type="button"
        disabled={isResponding}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void onRespondToApproval(requestId, "cancel");
        }}
      >
        Cancel approval
      </Button>
      <Button
        size="sm"
        variant="destructive-outline"
        type="button"
        disabled={isResponding}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void onRespondToApproval(requestId, "decline");
        }}
      >
        Decline
      </Button>
      <Button
        size="sm"
        variant="outline"
        type="button"
        disabled={isResponding}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void onRespondToApproval(requestId, "acceptForSession");
        }}
      >
        Always allow this session
      </Button>
      <Button
        size="sm"
        variant="default"
        type="button"
        disabled={isResponding}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void onRespondToApproval(requestId, "accept");
        }}
      >
        Approve once
      </Button>
    </>
  );
});
