import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';

import type { ApprovalSubmission, Promotion, ResourceLink } from '../../domain/models';
import { getFriendlyError } from '../../domain/errors';
import type { RoleCode } from '../../domain/permissions';
import { campaignService } from '../../lib/data';
import { PRIVATE_ASSET_MIME_TYPES, validatePrivateAssetFile } from '../../lib/data/private-assets';
import type { AssignmentRole } from '../../lib/data/service';
import {
  approvalDecisionSchema,
  assignmentSchema,
  cancellationSchema,
  invoiceSchema,
  issueInvoiceSchema,
  publicationSchema,
  promotionEditSchema,
  resourceLinkSchema,
  verificationSchema,
  type ApprovalDecisionInput,
  type InvoiceInput,
  type IssueInvoiceInput,
  type PublicationInput,
  type PromotionEditInput,
  type ResourceLinkInput,
  type VerificationInput,
} from '../../lib/validation/schemas';
import type { z } from 'zod';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { useAuth } from '../auth/AuthProvider';
import { toLocalDateTimeInputValue } from './presentation-helpers';

interface ControlledDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  pending: boolean;
}

const assignmentMeta: Record<
  AssignmentRole,
  { title: string; description: string; role: RoleCode; label: string }
> = {
  SALES_OWNER: {
    title: 'Assign sales owner',
    description: 'The owner remains responsible for client coordination.',
    role: 'SALES',
    label: 'Sales owner',
  },
  CREATOR: {
    title: 'Assign creator',
    description: 'Assigning the creator moves a Draft promotion into production.',
    role: 'CREATOR',
    label: 'Creator',
  },
  APPROVER: {
    title: 'Assign approver',
    description: 'The approver must be different from the creator who submits the work.',
    role: 'APPROVER',
    label: 'Approver',
  },
  PUBLISHER: {
    title: 'Assign publisher',
    description: 'The publisher receives the approved artifact and records external publication.',
    role: 'PUBLISHER',
    label: 'Publisher',
  },
};

export function PromotionEditDialog({
  promotion,
  onSubmit,
  ...props
}: ControlledDialogProps & {
  promotion: Promotion;
  onSubmit(input: PromotionEditInput): void;
}) {
  const form = useForm<PromotionEditInput>({
    resolver: zodResolver(promotionEditSchema),
    defaultValues: {
      title: promotion.title,
      description: promotion.description ?? '',
      dueDate: promotion.dueDate ?? '',
    },
  });

  useEffect(() => {
    if (props.open) {
      form.reset({
        title: promotion.title,
        description: promotion.description ?? '',
        dueDate: promotion.dueDate ?? '',
      });
    }
  }, [form, promotion.description, promotion.dueDate, promotion.title, props.open]);

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Edit promotion"
      description="Update the working brief while the promotion is still in its editable stage."
    >
      <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
        <Field
          label="Promotion title"
          htmlFor="edit-promotion-title"
          error={form.formState.errors.title?.message}
        >
          <Input id="edit-promotion-title" {...form.register('title')} />
        </Field>
        <Field
          label="Description"
          htmlFor="edit-promotion-description"
          error={form.formState.errors.description?.message}
        >
          <Textarea id="edit-promotion-description" {...form.register('description')} />
        </Field>
        <Field
          label="Due date"
          htmlFor="edit-promotion-due-date"
          error={form.formState.errors.dueDate?.message}
        >
          <Input id="edit-promotion-due-date" type="date" {...form.register('dueDate')} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={props.pending}>
            {props.pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AssignmentDialog({
  role,
  onSubmit,
  ...props
}: ControlledDialogProps & { role: AssignmentRole; onSubmit(userId: string): void }) {
  const meta = assignmentMeta[role];
  const { profile } = useAuth();
  const query = useQuery({
    queryKey: ['profiles', profile?.id, meta.role],
    queryFn: () => campaignService.listProfiles(meta.role),
    enabled: props.open && Boolean(profile),
  });
  const form = useForm<z.infer<typeof assignmentSchema>>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { userId: '' },
  });
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={meta.title}
      description={meta.description}
    >
      <form className="grid gap-5" onSubmit={form.handleSubmit((input) => onSubmit(input.userId))}>
        <Field
          label={meta.label}
          htmlFor={`assign-${role}`}
          error={form.formState.errors.userId?.message}
        >
          <Select id={`assign-${role}`} disabled={query.isLoading} {...form.register('userId')}>
            <option value="">
              {query.isLoading ? 'Loading team…' : `Choose ${meta.label.toLowerCase()}`}
            </option>
            {query.data?.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.displayName} · {profile.email}
              </option>
            ))}
          </Select>
        </Field>
        {query.error ? (
          <p className="text-sm text-red-300">Unable to load eligible team members.</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={props.pending || query.isLoading}>
            {props.pending ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ResourceDialog({
  onSubmit,
  onUpload,
  uploadProgress,
  ...props
}: ControlledDialogProps & {
  onSubmit(input: ResourceLinkInput): void;
  onUpload(file: File): void;
  uploadProgress: number;
}) {
  const [mode, setMode] = useState<'link' | 'upload'>('link');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const form = useForm<ResourceLinkInput>({
    resolver: zodResolver(resourceLinkSchema),
    defaultValues: { provider: 'CANVA', resourceType: 'SOCIAL_CREATIVE', displayName: '', url: '' },
  });

  useEffect(() => {
    if (!props.open) {
      setMode('link');
      setFile(null);
      setFileError(undefined);
      form.reset();
    }
  }, [form, props.open]);

  const chooseFile = (selected: File | undefined) => {
    setFile(selected ?? null);
    if (!selected) {
      setFileError('Choose an image or PDF file.');
      return;
    }
    try {
      validatePrivateAssetFile(selected);
      setFileError(undefined);
    } catch (error) {
      setFileError(getFriendlyError(error));
    }
  };

  const submitUpload = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setFileError('Choose an image or PDF file.');
      return;
    }
    try {
      validatePrivateAssetFile(file);
      setFileError(undefined);
      onUpload(file);
    } catch (error) {
      setFileError(getFriendlyError(error));
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Attach resource"
      description="Add a secure HTTPS reference or upload a private creative asset."
    >
      <div className="mb-5 grid grid-cols-2 rounded-lg border border-[var(--border)] bg-black/15 p-1">
        <Button
          type="button"
          variant={mode === 'link' ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={mode === 'link'}
          disabled={props.pending}
          onClick={() => setMode('link')}
        >
          External link
        </Button>
        <Button
          type="button"
          variant={mode === 'upload' ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={mode === 'upload'}
          disabled={props.pending}
          onClick={() => setMode('upload')}
        >
          Private upload
        </Button>
      </div>
      {mode === 'link' ? (
        <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Provider"
              htmlFor="resource-provider"
              error={form.formState.errors.provider?.message}
            >
              <Select id="resource-provider" {...form.register('provider')}>
                <option value="CANVA">Canva</option>
                <option value="GOOGLE_DRIVE">Google Drive</option>
                <option value="DROPBOX">Dropbox</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field
              label="Resource type"
              htmlFor="resource-type"
              error={form.formState.errors.resourceType?.message}
            >
              <Input
                id="resource-type"
                placeholder="SOCIAL_CREATIVE"
                {...form.register('resourceType')}
              />
            </Field>
          </div>
          <Field
            label="Display name"
            htmlFor="resource-name"
            error={form.formState.errors.displayName?.message}
          >
            <Input
              id="resource-name"
              placeholder="Campaign master creative"
              {...form.register('displayName')}
            />
          </Field>
          <Field
            label="HTTPS link"
            htmlFor="resource-url"
            error={form.formState.errors.url?.message}
            hint="The validation worker checks provider format and safe availability."
          >
            <Input
              id="resource-url"
              type="url"
              placeholder="https://www.canva.com/design/…"
              {...form.register('url')}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={props.pending}>
              {props.pending ? 'Attaching…' : 'Attach resource'}
            </Button>
          </div>
        </form>
      ) : (
        <form className="grid gap-5" onSubmit={submitUpload}>
          <div className="rounded-lg border border-[var(--acid)]/20 bg-[var(--acid)]/6 p-4 text-xs leading-5 text-[var(--text-muted)]">
            Files stay in a private bucket. Access uses a new five-minute signed link each time you
            open the asset.
          </div>
          <Field
            label="Image or PDF"
            htmlFor="private-asset-file"
            error={fileError}
            hint="JPG, PNG, WebP, GIF, or PDF · Maximum 25 MiB."
          >
            <Input
              id="private-asset-file"
              type="file"
              accept={PRIVATE_ASSET_MIME_TYPES.join(',')}
              disabled={props.pending}
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </Field>
          {file && !fileError ? (
            <p className="text-xs text-[var(--text-muted)]">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MiB
            </p>
          ) : null}
          {props.pending ? (
            <div className="grid gap-2" aria-live="polite">
              <div className="flex justify-between text-xs text-[var(--text-muted)]">
                <span>{uploadProgress < 35 ? 'Registering private asset…' : 'Uploading…'}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-black/30"
                role="progressbar"
                aria-label="Private asset upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
              >
                <div
                  className="h-full rounded-full bg-[var(--acid)] transition-[width]"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={props.pending || Boolean(fileError)}>
              {props.pending ? 'Uploading…' : 'Upload private asset'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function ApprovalDialog({
  submission,
  initialDecision,
  onSubmit,
  ...props
}: ControlledDialogProps & {
  submission: ApprovalSubmission | null;
  initialDecision: ApprovalDecisionInput['decision'];
  onSubmit(input: ApprovalDecisionInput): void;
}) {
  const form = useForm<ApprovalDecisionInput>({
    resolver: zodResolver(approvalDecisionSchema),
    values: { decision: initialDecision, comments: '' },
  });
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={initialDecision === 'APPROVED' ? 'Approve creative' : 'Request revision'}
      description={
        submission
          ? `Submission ${submission.submissionNumber} · ${submission.resourceName}`
          : 'Review the pending submission.'
      }
    >
      <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
        <input type="hidden" {...form.register('decision')} />
        <Field
          label={initialDecision === 'APPROVED' ? 'Approval note' : 'Revision notes'}
          htmlFor="approval-comments"
          error={form.formState.errors.comments?.message}
          hint={
            initialDecision === 'APPROVED'
              ? 'Optional. The decision is permanent and auditable.'
              : undefined
          }
        >
          <Textarea
            id="approval-comments"
            placeholder={
              initialDecision === 'APPROVED'
                ? 'Optional note…'
                : 'Describe exactly what needs to change…'
            }
            {...form.register('comments')}
          />
        </Field>
        <div className="rounded-lg border border-[var(--border)] bg-black/15 p-4 text-xs leading-5 text-[var(--text-muted)]">
          This creates an immutable decision. A revision keeps every earlier submission and requires
          a new version.
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={initialDecision === 'APPROVED' ? 'primary' : 'secondary'}
            disabled={props.pending}
          >
            {props.pending
              ? 'Saving…'
              : initialDecision === 'APPROVED'
                ? 'Approve submission'
                : 'Request revision'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function PublicationDialog({
  resources,
  onSubmit,
  ...props
}: ControlledDialogProps & { resources: ResourceLink[]; onSubmit(input: PublicationInput): void }) {
  const defaultPublishedAt = useMemo(() => toLocalDateTimeInputValue(new Date()), []);
  const form = useForm<PublicationInput>({
    resolver: zodResolver(publicationSchema),
    defaultValues: {
      provider: 'INSTAGRAM',
      destination: '',
      publicationUrl: '',
      externalPublicationId: '',
      artifactResourceLinkId: resources[0]?.id ?? '',
      publishedAt: defaultPublishedAt,
    },
  });
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Record publication"
      description="Manual adapter: record content already published outside this system. This does not publish automatically."
    >
      <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="rounded-lg border border-[var(--acid)]/20 bg-[var(--acid)]/6 p-4 text-xs leading-5 text-[var(--acid)]">
          Manual publishing mode · evidence will be stored in the immutable publication history.
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Provider"
            htmlFor="publication-provider"
            error={form.formState.errors.provider?.message}
          >
            <Input
              id="publication-provider"
              placeholder="INSTAGRAM"
              {...form.register('provider')}
            />
          </Field>
          <Field
            label="Destination"
            htmlFor="publication-destination"
            error={form.formState.errors.destination?.message}
          >
            <Input
              id="publication-destination"
              placeholder="@client_official"
              {...form.register('destination')}
            />
          </Field>
        </div>
        <Field
          label="Publication URL"
          htmlFor="publication-url"
          error={form.formState.errors.publicationUrl?.message}
        >
          <Input
            id="publication-url"
            type="url"
            placeholder="https://www.instagram.com/p/…"
            {...form.register('publicationUrl')}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Published at"
            htmlFor="published-at"
            error={form.formState.errors.publishedAt?.message}
          >
            <Input id="published-at" type="datetime-local" {...form.register('publishedAt')} />
          </Field>
          <Field
            label="External ID"
            htmlFor="external-publication-id"
            error={form.formState.errors.externalPublicationId?.message}
            hint="Optional."
          >
            <Input id="external-publication-id" {...form.register('externalPublicationId')} />
          </Field>
        </div>
        <Field
          label="Approved artifact"
          htmlFor="publication-artifact"
          error={form.formState.errors.artifactResourceLinkId?.message}
        >
          <Select id="publication-artifact" {...form.register('artifactResourceLinkId')}>
            <option value="">Choose an artifact</option>
            {resources
              .filter((item) => !item.archivedAt)
              .map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.displayName}
                </option>
              ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={props.pending}>
            {props.pending ? 'Recording…' : 'Record publication'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function VerificationDialog({
  onSubmit,
  ...props
}: ControlledDialogProps & { onSubmit(input: VerificationInput): void }) {
  const form = useForm<VerificationInput>({
    resolver: zodResolver(verificationSchema),
    defaultValues: { status: 'VERIFIED', notes: '' },
  });
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Record manual verification"
      description="Confirm the live publication evidence. Failed attempts remain in history and can be retried."
    >
      <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
        <Field
          label="Verification result"
          htmlFor="verification-status"
          error={form.formState.errors.status?.message}
        >
          <Select id="verification-status" {...form.register('status')}>
            <option value="VERIFIED">Verified</option>
            <option value="FAILED">Failed</option>
            <option value="UNAVAILABLE">Unavailable</option>
          </Select>
        </Field>
        <Field
          label="Evidence notes"
          htmlFor="verification-notes"
          error={form.formState.errors.notes?.message}
        >
          <Textarea
            id="verification-notes"
            placeholder="What was checked, and what was visible?"
            {...form.register('notes')}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={props.pending}>
            {props.pending ? 'Recording…' : 'Record verification'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function InvoiceDialog({
  onSubmit,
  ...props
}: ControlledDialogProps & { onSubmit(input: InvoiceInput): void }) {
  const form = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: { amount: 0, currency: 'USD', invoiceNumber: '', status: 'ISSUED' },
  });
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Register invoice"
      description="Manual accounting adapter: register an invoice created externally or create a local draft."
    >
      <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="rounded-lg border border-[var(--acid)]/20 bg-[var(--acid)]/6 p-4 text-xs leading-5 text-[var(--acid)]">
          Manual accounting mode · no external accounting system will be contacted.
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Amount"
            htmlFor="invoice-amount"
            error={form.formState.errors.amount?.message}
          >
            <Input
              id="invoice-amount"
              type="number"
              step="0.01"
              min="0.01"
              {...form.register('amount', { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Currency"
            htmlFor="invoice-currency"
            error={form.formState.errors.currency?.message}
          >
            <Input id="invoice-currency" maxLength={3} {...form.register('currency')} />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Invoice number"
            htmlFor="invoice-number"
            error={form.formState.errors.invoiceNumber?.message}
            hint="Optional for a draft."
          >
            <Input id="invoice-number" {...form.register('invoiceNumber')} />
          </Field>
          <Field
            label="Status"
            htmlFor="invoice-status"
            error={form.formState.errors.status?.message}
          >
            <Select id="invoice-status" {...form.register('status')}>
              <option value="DRAFT">Draft</option>
              <option value="ISSUED">Issued</option>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={props.pending}>
            {props.pending ? 'Saving…' : 'Register invoice'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function IssueInvoiceDialog({
  onSubmit,
  ...props
}: ControlledDialogProps & { onSubmit(input: IssueInvoiceInput): void }) {
  const form = useForm<IssueInvoiceInput>({
    resolver: zodResolver(issueInvoiceSchema),
    defaultValues: { invoiceNumber: '' },
  });
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Issue invoice"
      description="Add the final external invoice number and move this local draft to Issued atomically."
    >
      <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
        <Field
          label="Invoice number"
          htmlFor="issue-invoice-number"
          error={form.formState.errors.invoiceNumber?.message}
        >
          <Input id="issue-invoice-number" autoFocus {...form.register('invoiceNumber')} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={props.pending}>
            {props.pending ? 'Issuing…' : 'Issue invoice'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function CancellationDialog({
  onSubmit,
  ...props
}: ControlledDialogProps & { onSubmit(reason: string): void }) {
  const form = useForm<z.infer<typeof cancellationSchema>>({
    resolver: zodResolver(cancellationSchema),
    defaultValues: { reason: '' },
  });
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Cancel promotion"
      description="Cancellation is terminal for the main workflow and the reason is permanently audited."
    >
      <form className="grid gap-5" onSubmit={form.handleSubmit((input) => onSubmit(input.reason))}>
        <Field
          label="Cancellation reason"
          htmlFor="cancellation-reason"
          error={form.formState.errors.reason?.message}
        >
          <Textarea
            id="cancellation-reason"
            placeholder="Explain why this promotion is being cancelled…"
            {...form.register('reason')}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Keep promotion
          </Button>
          <Button type="submit" variant="danger" disabled={props.pending}>
            {props.pending ? 'Cancelling…' : 'Cancel promotion'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
