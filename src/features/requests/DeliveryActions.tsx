import { CheckCircle2, PackageCheck, Truck, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toUserMessage, type RequestDetail } from '@/api';
import { canConfirmReceived, canMarkPickedUp } from '@/api/lifecycle';
import { useConfirmReceived, useMarkPickedUp } from '@/api/queries';
import { Button } from '@/components/ui/Button';
import { firstNameOf, formatDate, formatTime } from '@/lib/format';

type ActionProps = {
  detail: RequestDetail;
  onDone?: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
};

type StepActionProps = {
  icon: LucideIcon;
  intro: string;
  button: string;
  title: string;
  description: string;
  confirm: string;
  pending: boolean;
  error: unknown;
  resetKey: string;
  onConfirm: () => void;
  onCancel: () => void;
};

const Panel = ({ children }: { children: ReactNode }) => (
  <section aria-label="Delivery" className="mt-8 rounded-2xl bg-white p-4 sm:p-6">
    {children}
  </section>
);

const Info = ({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) => (
  <p className="flex items-start gap-2 text-sm text-ink-500">
    <Icon className="mt-0.5 size-4 shrink-0 text-navy" aria-hidden />
    <span>{children}</span>
  </p>
);

const StepAction = ({ icon: Icon, intro, button, title, description, confirm, pending, error, resetKey, onConfirm, onCancel }: StepActionProps) => {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setConfirming(false), [resetKey]);

  return (
    <Panel>
      {Boolean(error) && (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {toUserMessage(error)}
        </p>
      )}
      {confirming ? (
        <div>
          <h3 className="font-display text-lg font-bold text-navy">{title}</h3>
          <p className="mt-1 text-sm text-ink-500">{description}</p>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                onCancel();
                setConfirming(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" loading={pending} onClick={onConfirm} autoFocus>
              {confirm}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Info icon={Truck}>{intro}</Info>
          <Button variant="primary" className="shrink-0" onClick={() => setConfirming(true)}>
            <Icon className="size-5" aria-hidden />
            {button}
          </Button>
        </div>
      )}
    </Panel>
  );
};

export const ConfirmReceivedAction = ({ detail, onDone, onBusyChange }: ActionProps) => {
  const mutation = useConfirmReceived();
  useEffect(() => onBusyChange?.(mutation.isPending), [mutation.isPending, onBusyChange]);

  if (!canConfirmReceived(detail.status)) return null;

  return (
    <StepAction
      icon={CheckCircle2}
      intro={`${detail.pickedUpBy ?? 'Office logistics'} is bringing your items. Confirm once everything has arrived.`}
      button="Confirm Received"
      title="Did all the items arrive?"
      description={`Check that you received ${detail.totalQuantity} qty across ${detail.itemCount} item(s). This finishes the request.`}
      confirm="Yes, Received"
      pending={mutation.isPending}
      error={mutation.error}
      resetKey={detail.status}
      onCancel={() => mutation.reset()}
      onConfirm={() => mutation.mutate(detail.id, { onSuccess: (updated) => onDone?.(`${updated.code} received. Request finished.`) })}
    />
  );
};

export const PickupAction = ({ detail, onDone, onBusyChange }: ActionProps) => {
  const mutation = useMarkPickedUp();
  useEffect(() => onBusyChange?.(mutation.isPending), [mutation.isPending, onBusyChange]);

  if (canMarkPickedUp(detail.status)) {
    return (
      <StepAction
        icon={PackageCheck}
        intro={`Collect the items at ${detail.pickupLocation} and deliver them to ${detail.requester.name}.`}
        button="Mark as Picked Up"
        title="Picked up the items?"
        description={`${firstNameOf(detail.requester.name)} will be told the items are on the way.`}
        confirm="Yes, Picked Up"
        pending={mutation.isPending}
        error={mutation.error}
        resetKey={detail.status}
        onCancel={() => mutation.reset()}
        onConfirm={() => mutation.mutate(detail.id, { onSuccess: (updated) => onDone?.(`${updated.code} picked up. Deliver it to ${firstNameOf(updated.requester.name)}.`) })}
      />
    );
  }

  return (
    <Panel>
      {detail.status === 'in_delivery' ? (
        <Info icon={Truck}>On the way. {firstNameOf(detail.requester.name)} will tap "Confirm Received" when the items arrive.</Info>
      ) : detail.receivedAt ? (
        <Info icon={CheckCircle2}>
          Delivered — received on {formatDate(detail.receivedAt)}, {formatTime(detail.receivedAt)}.
        </Info>
      ) : (
        <Info icon={CheckCircle2}>No delivery action needed.</Info>
      )}
    </Panel>
  );
};
