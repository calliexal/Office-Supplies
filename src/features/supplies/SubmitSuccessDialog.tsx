import type { RequestDetail } from '@/api';
import { figmaAssets } from '@/assets/figma';
import { Dialog } from '@/components/ui/Dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatShortDate, pluralize } from '@/lib/format';

type SubmitSuccessDialogProps = {
  request: RequestDetail | null;
  onBackToDashboard: () => void;
  onClose: () => void;
};

export const SubmitSuccessDialog = ({ request, onBackToDashboard, onClose }: SubmitSuccessDialogProps) => (
  <Dialog open={request !== null} onClose={onClose} className="max-w-[456px]">
    {({ labelId, descriptionId }) =>
      request && (
        <div className="flex flex-col items-center px-6 pb-6 pt-[53px] text-center">
          <img src={figmaAssets.iconSuccess} alt="" width={92} height={92} />
          <h2 id={labelId} className="mt-[27px] font-display text-2xl font-semibold text-black">
            Success! Your request has been submitted.
          </h2>
          <p id={descriptionId} className="mt-[10px] text-[15px] text-ink-500">
            You can track the status of your request in the Request History page.
          </p>

          <dl className="mt-[27px] w-full space-y-3 rounded-[21px] bg-sky px-[15px] py-6 text-xs">
            {[
              ['Request ID:', request.code],
              ['Date:', formatShortDate(request.createdAt)],
              ['Departement:', request.requester.department],
              ['Total Items:', pluralize(request.itemCount, 'item')],
              ['Total Quantity:', `${request.totalQuantity} Qty`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="font-display font-medium text-ink-400">{label}</dt>
                <dd className="text-right font-medium text-navy">{value}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4">
              <dt className="font-display font-medium text-ink-400">Status:</dt>
              <dd>
                <StatusBadge status={request.status} />
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={onBackToDashboard}
            autoFocus
            className="mt-[19px] h-[54px] w-full max-w-[328px] rounded-[35px] bg-navy font-display text-sm font-semibold text-white transition-colors hover:bg-navy-deep"
          >
            Back To Dashboard
          </button>
        </div>
      )
    }
  </Dialog>
);
