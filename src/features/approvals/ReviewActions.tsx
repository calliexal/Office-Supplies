import { CheckCircle2, PackageCheck, Truck, XCircle } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { isApiError, toUserMessage, type RequestDetail, type ReviewStatus } from '@/api';
import { NEXT_STATUSES, REJECTION_REASON_MAX } from '@/api/lifecycle';
import { useUpdateRequestStatus } from '@/api/queries';
import { Button } from '@/components/ui/Button';
import { firstNameOf } from '@/lib/format';

type ForwardStatus = Exclude<ReviewStatus, 'rejected'>;

const FORWARD: Record<ForwardStatus, { button: string; title: string; confirm: string; done: string; describe: (d: RequestDetail) => string }> = {
  approved: {
    button: 'Approve',
    title: 'Approve this request?',
    confirm: 'Yes, Approve',
    done: 'approved',
    describe: (d) => `${firstNameOf(d.requester.name)} will see it as Approved. The items stay reserved until they are picked up.`,
  },
  ready_for_pickup: {
    button: 'Mark Ready for Pickup',
    title: 'Items ready for pickup?',
    confirm: 'Yes, Ready',
    done: 'marked ready for pickup',
    describe: (d) => `${firstNameOf(d.requester.name)} will be told to collect the items at ${d.pickupLocation}.`,
  },
  finished: {
    button: 'Mark as Handed Over',
    title: 'Items handed over?',
    confirm: 'Yes, Finished',
    done: 'finished',
    describe: (d) => `Confirm that ${firstNameOf(d.requester.name)} has collected every item. This closes the request.`,
  },
};

const ICONS: Record<ForwardStatus, typeof CheckCircle2> = { approved: CheckCircle2, ready_for_pickup: Truck, finished: PackageCheck };

type Step = { kind: 'idle' } | { kind: 'confirm'; status: ForwardStatus } | { kind: 'reject' };

type ReviewActionsProps = {
  detail: RequestDetail;
  onDone: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
};

export const ReviewActions = ({ detail, onDone, onBusyChange }: ReviewActionsProps) => {
  const mutation = useUpdateRequestStatus();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const reasonErrorId = useId();

  useEffect(() => onBusyChange(mutation.isPending), [mutation.isPending, onBusyChange]);
  useEffect(() => setStep({ kind: 'idle' }), [detail.status]);

  const next = NEXT_STATUSES[detail.status];
  if (next.length === 0) {
    return (
      <p className="mt-8 rounded-lg bg-white px-4 py-3 text-center text-sm text-ink-500">
        This request is {detail.status === 'rejected' ? 'rejected' : 'finished'} — no further action needed.
      </p>
    );
  }

  const error = mutation.error;
  const fieldError = isApiError(error) ? error.fields.reason : undefined;
  const generalError = error && !fieldError ? toUserMessage(error) : null;

  const run = (status: ReviewStatus, rejectionReason?: string) =>
    mutation.mutate(
      { id: detail.id, status, reason: rejectionReason },
      {
        onSuccess: (updated) => {
          const label = status === 'rejected' ? 'rejected' : FORWARD[status].done;
          onDone(`${updated.code} ${label}.`);
        },
      },
    );

  const cancel = () => {
    mutation.reset();
    setStep({ kind: 'idle' });
  };

  const submitReject = (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim()) run('rejected', reason.trim());
  };

  const trimmedLength = reason.trim().length;

  return (
    <section aria-label="Review actions" className="mt-8 rounded-2xl bg-white p-4 sm:p-6">
      {generalError && (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {generalError}
        </p>
      )}

      {step.kind === 'idle' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          {next.includes('rejected') && (
            <Button variant="outline" className="border-danger text-danger hover:bg-danger-soft" onClick={() => setStep({ kind: 'reject' })}>
              <XCircle className="size-5" aria-hidden />
              Reject
            </Button>
          )}
          {next
            .filter((status): status is ForwardStatus => status !== 'rejected')
            .map((status) => {
              const Icon = ICONS[status];
              return (
                <Button key={status} variant={status === 'approved' ? 'primary' : 'navy'} onClick={() => setStep({ kind: 'confirm', status })}>
                  <Icon className="size-5" aria-hidden />
                  {FORWARD[status].button}
                </Button>
              );
            })}
        </div>
      )}

      {step.kind === 'confirm' && (
        <div>
          <h3 className="font-display text-lg font-bold text-navy">{FORWARD[step.status].title}</h3>
          <p className="mt-1 text-sm text-ink-500">{FORWARD[step.status].describe(detail)}</p>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={cancel} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant={step.status === 'approved' ? 'primary' : 'navy'}
              loading={mutation.isPending}
              onClick={() => run(step.status)}
              autoFocus
            >
              {FORWARD[step.status].confirm}
            </Button>
          </div>
        </div>
      )}

      {step.kind === 'reject' && (
        <form onSubmit={submitReject} noValidate>
          <label htmlFor={reasonId} className="font-display text-lg font-bold text-danger">
            Reason for rejection
          </label>
          <p className="mt-1 text-sm text-ink-500">
            {firstNameOf(detail.requester.name)} will see this message. The reserved items go back into stock.
          </p>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={REJECTION_REASON_MAX}
            rows={3}
            required
            autoFocus
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? reasonErrorId : undefined}
            placeholder="e.g. Black Marker is out of stock until next week."
            className="mt-3 block w-full resize-y rounded-lg border border-ink-400 px-3 py-2 text-sm text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 aria-[invalid=true]:border-danger"
          />
          <div className="mt-1 flex justify-between gap-4 text-xs">
            <span id={reasonErrorId} className="text-danger">
              {fieldError}
            </span>
            <span className="shrink-0 text-ink-400">
              {trimmedLength}/{REJECTION_REASON_MAX}
            </span>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={cancel} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={mutation.isPending} disabled={trimmedLength === 0}>
              Reject Request
            </Button>
          </div>
        </form>
      )}
    </section>
  );
};
