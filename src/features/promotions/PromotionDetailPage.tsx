import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  FileImage,
  History,
  Link2,
  Lock,
  LoaderCircle,
  MessageSquareWarning,
  Pencil,
  Play,
  Plus,
  ReceiptText,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import type {
  ApprovalDecisionInput,
  InvoiceInput,
  PublicationInput,
  PromotionEditInput,
  ResourceLinkInput,
  VerificationInput,
} from '../../lib/validation/schemas';
import type { AssignmentRole } from '../../lib/data/service';
import type {
  Invoice,
  PromotionAction,
  PromotionDetail,
  PublishingAccount,
  PublicationVerification,
  ResourceLink,
} from '../../domain/models';
import { isPublishingChannel, publishingChannelLabel } from '../../domain/channels';
import { hasAnyRole } from '../../domain/permissions';
import { getFriendlyError, toDomainError } from '../../domain/errors';
import { campaignService } from '../../lib/data';
import { formatDate, formatDateTime, formatMoney, formatRelativeTime } from '../../lib/utils';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PromotionStatusBadge } from './PromotionStatusBadge';
import { getApprovedPublicationResources, getCurrentOwnerName } from './presentation-helpers';
import {
  ApprovalDialog,
  AssignmentDialog,
  CancellationDialog,
  InvoiceDialog,
  IssueInvoiceDialog,
  PublicationDialog,
  PromotionEditDialog,
  ResourceDialog,
  VerificationDialog,
} from './ActionForms';

function channelName(value: string) {
  return isPublishingChannel(value) ? publishingChannelLabel[value] : value;
}
import { useAuth } from '../auth/AuthProvider';
import { canViewFinanceQueue } from '../my-work/visibility';

type DialogState =
  | null
  | { type: 'assign'; role: AssignmentRole }
  | { type: 'edit' }
  | { type: 'resource' }
  | { type: 'approve'; decision: ApprovalDecisionInput['decision'] }
  | { type: 'publication' }
  | { type: 'verification' }
  | { type: 'invoice' }
  | { type: 'issue-invoice' }
  | { type: 'cancel' };

interface ActionRequest {
  run(): Promise<unknown>;
  success: string;
}

const workflowStages = [
  { label: 'Brief', statuses: ['DRAFT'] },
  {
    label: 'Creative',
    statuses: ['CREATOR_ASSIGNED', 'CREATIVE_IN_PROGRESS', 'REVISION_REQUESTED'],
  },
  { label: 'Approval', statuses: ['SUBMITTED_FOR_APPROVAL', 'APPROVED'] },
  { label: 'Publishing', statuses: ['PUBLISHER_ASSIGNED', 'PUBLISHING_IN_PROGRESS', 'PUBLISHED'] },
  { label: 'Verification', statuses: ['VERIFICATION_PENDING', 'VERIFIED'] },
  { label: 'Finance', statuses: ['READY_FOR_INVOICING', 'INVOICED'] },
] as const;

function currentStageIndex(status: string) {
  if (status === 'CANCELLED') return -1;
  return workflowStages.findIndex((stage) =>
    (stage.statuses as readonly string[]).includes(status),
  );
}

function ActionButton({
  action,
  allowed,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { action: PromotionAction; allowed: PromotionAction[] }) {
  if (!allowed.includes(action)) return null;
  return <Button {...props}>{children}</Button>;
}

export function ResourceAccessControl({
  resource,
  opening,
  onOpenPrivate,
}: {
  resource: ResourceLink;
  opening: boolean;
  onOpenPrivate(id: string, storagePath: string): void;
}) {
  if (resource.provider === 'SUPABASE_STORAGE') {
    return (
      <Button
        variant="secondary"
        size="sm"
        disabled={!resource.storagePath || opening}
        onClick={() => resource.storagePath && onOpenPrivate(resource.id, resource.storagePath)}
      >
        {opening ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Lock className="size-3.5" />
        )}
        {opening ? 'Opening…' : 'Open private asset'}
      </Button>
    );
  }

  return (
    <Button asChild variant="secondary" size="sm">
      <a href={resource.url} target="_blank" rel="noreferrer">
        External link <ArrowUpRight className="size-3.5" />
      </a>
    </Button>
  );
}

function OverviewSection({ detail }: { detail: PromotionDetail }) {
  const { promotion, metadata } = detail;
  const assignments = [
    { label: 'Sales owner', name: promotion.salesOwnerName },
    { label: 'Creator', name: promotion.creatorName },
    { label: 'Approver', name: promotion.approverName },
    { label: 'Publisher', name: promotion.publisherName },
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.6fr)]">
      <Card>
        <CardHeader
          title="Promotion brief"
          description="The durable client and production context."
        />
        <CardBody>
          <p className="text-sm leading-7 text-[var(--text-muted)]">
            {promotion.description || 'No description has been added.'}
          </p>
          <dl className="mt-7 grid gap-5 border-t border-[var(--border)] pt-6 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                Client
              </dt>
              <dd className="mt-2 text-sm font-semibold text-[var(--text)]">
                {promotion.clientName}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                Due date
              </dt>
              <dd className="mt-2 text-sm font-semibold text-[var(--text)]">
                {formatDate(promotion.dueDate)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                Version
              </dt>
              <dd className="mt-2 text-sm font-semibold text-[var(--text)]">
                v{promotion.version}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader
          title="Campaign operating brief"
          description="Structured planning metadata used by the weekly queue and publishing handoff."
        />
        <CardBody>
          {metadata ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                  Type
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                  {metadata.campaignType}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                  Priority
                </p>
                <div className="mt-2">
                  <Badge
                    tone={
                      metadata.priority === 'URGENT' || metadata.priority === 'HIGH'
                        ? 'attention'
                        : 'neutral'
                    }
                  >
                    {metadata.priority}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                  Scheduled
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                  {formatDate(metadata.scheduledDate)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                  Channels
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                  {metadata.platforms.map(channelName).join(' · ') || 'Not selected'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              No operating metadata has been added yet.
            </p>
          )}
          {metadata?.briefUrl ? (
            <a
              href={metadata.briefUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--acid-ink)] hover:text-[var(--acid-ink)]"
            >
              Open brief <ArrowUpRight className="size-3.5" />
            </a>
          ) : null}
          {metadata?.internalNotes ? (
            <p className="mt-5 border-t border-[var(--border)] pt-4 text-sm leading-6 text-[var(--text-muted)]">
              {metadata.internalNotes}
            </p>
          ) : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Current team"
          description="Live assignments backed by append-only history."
        />
        <div className="divide-y divide-[var(--border)]">
          {assignments.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-4 px-5 py-4">
              <span className="text-xs text-[var(--text-dim)]">{item.label}</span>
              <span
                className={`text-sm font-medium ${item.name ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}`}
              >
                {item.name ?? 'Unassigned'}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ResourcesSection({
  detail,
  canAttach,
  onAdd,
  onArchive,
  onOpenPrivate,
  openingResourceId,
  onSubmit,
}: {
  detail: PromotionDetail;
  canAttach: boolean;
  onAdd(): void;
  onArchive(id: string): void;
  onOpenPrivate(id: string, storagePath: string): void;
  openingResourceId: string | null;
  onSubmit(id: string): void;
}) {
  const active = detail.resources.filter((resource) => !resource.archivedAt);
  return (
    <Card>
      <CardHeader
        title="Creative resources"
        description="External references and private assets attached to this promotion."
        action={
          canAttach ? (
            <Button size="sm" onClick={onAdd}>
              <Plus className="size-3.5" />
              Attach resource
            </Button>
          ) : undefined
        }
      />
      {active.length ? (
        <div className="divide-y divide-[var(--border)]">
          {active.map((resource) => (
            <article
              key={resource.id}
              className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex min-w-0 items-start gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/5 text-[var(--acid-ink)]">
                  <FileImage className="size-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-[var(--text)]">
                      {resource.displayName}
                    </h3>
                    <Badge
                      tone={
                        resource.validationStatus === 'VALID'
                          ? 'success'
                          : resource.validationStatus === 'INVALID'
                            ? 'danger'
                            : 'attention'
                      }
                    >
                      {resource.validationStatus}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-dim)]">
                    {resource.provider.replace('_', ' ')} ·{' '}
                    {resource.resourceType.replaceAll('_', ' ')} · Added{' '}
                    {formatRelativeTime(resource.attachedAt)}
                  </p>
                  {resource.validationMessage ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      {resource.validationMessage}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-14 lg:pl-0">
                <ResourceAccessControl
                  resource={resource}
                  opening={openingResourceId === resource.id}
                  onOpenPrivate={onOpenPrivate}
                />
                {detail.promotion.allowedActions.includes('SUBMIT_FOR_APPROVAL') ? (
                  <Button size="sm" onClick={() => onSubmit(resource.id)}>
                    Submit for approval <Send className="size-3.5" />
                  </Button>
                ) : null}
                {canAttach ? (
                  <Button variant="ghost" size="sm" onClick={() => onArchive(resource.id)}>
                    <Archive className="size-3.5" />
                    Archive
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Link2 className="size-5" />}
          title="No resources attached"
          description="Attach a Canva, Drive, Dropbox, or secure private asset before creative submission."
          action={canAttach ? <Button onClick={onAdd}>Attach resource</Button> : undefined}
        />
      )}
    </Card>
  );
}

function CreativeSection({
  detail,
  onStart,
  onSubmit,
}: {
  detail: PromotionDetail;
  onStart(): void;
  onSubmit(resourceId: string): void;
}) {
  const activeResources = detail.resources.filter((resource) => !resource.archivedAt);
  const latestResource = activeResources[0];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,.6fr)]">
      <Card>
        <CardHeader
          title="Creative production"
          description="The assigned creator owns the current working cycle and submits an immutable version for review."
        />
        <CardBody>
          <div className="flex flex-col gap-5 rounded-lg border border-[var(--border)] bg-black/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid size-11 place-items-center rounded-lg bg-[var(--acid)]/8 text-[var(--acid-ink)]">
                <UserRound className="size-5" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-dim)]">Assigned creator</p>
                <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                  {detail.promotion.creatorName ?? 'Not assigned'}
                </p>
              </div>
            </div>
            {detail.promotion.allowedActions.includes('START_CREATIVE_WORK') ? (
              <Button onClick={onStart}>
                <Play className="size-4" />
                Start work
              </Button>
            ) : null}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border)] p-4">
              <p className="text-[10px] font-bold tracking-[0.1em] text-[var(--text-dim)] uppercase">
                Active resources
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {activeResources.length}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-4">
              <p className="text-[10px] font-bold tracking-[0.1em] text-[var(--text-dim)] uppercase">
                Submissions
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {detail.submissions.length}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-4">
              <p className="text-[10px] font-bold tracking-[0.1em] text-[var(--text-dim)] uppercase">
                Revision cycles
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {detail.submissions.filter((item) => item.state === 'REVISION_REQUESTED').length}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Current deliverable" description="Latest active creative reference." />
        {latestResource ? (
          <CardBody>
            <FileImage className="size-6 text-[var(--acid-ink)]" />
            <p className="mt-4 text-sm font-semibold text-[var(--text)]">
              {latestResource.displayName}
            </p>
            <p className="mt-2 text-xs text-[var(--text-dim)]">
              {latestResource.provider.replace('_', ' ')} · {latestResource.validationStatus}
            </p>
            {detail.promotion.allowedActions.includes('SUBMIT_FOR_APPROVAL') ? (
              <Button className="mt-5 w-full" onClick={() => onSubmit(latestResource.id)}>
                <Send className="size-4" />
                Submit this version
              </Button>
            ) : null}
          </CardBody>
        ) : (
          <EmptyState
            icon={<FileImage className="size-5" />}
            title="No deliverable yet"
            description="Attach a resource before submitting creative for approval."
          />
        )}
      </Card>
    </div>
  );
}

function ApprovalSection({
  detail,
  onDecision,
}: {
  detail: PromotionDetail;
  onDecision(decision: ApprovalDecisionInput['decision']): void;
}) {
  const pending = detail.submissions.find((submission) => submission.state === 'PENDING');
  return (
    <div className="space-y-5">
      {pending ? (
        <Card className="border-[var(--acid)]/25 bg-[var(--acid)]/[0.025]">
          <CardHeader
            title={`Submission ${pending.submissionNumber} awaits review`}
            description={`${pending.resourceName} · Submitted by ${pending.submittedByName} ${formatRelativeTime(pending.submittedAt)}`}
          />
          <CardBody className="flex flex-wrap gap-2">
            {detail.promotion.allowedActions.includes('DECIDE_APPROVAL') ? (
              <Button onClick={() => onDecision('APPROVED')}>
                <Check className="size-4" />
                Approve
              </Button>
            ) : null}
            {detail.promotion.allowedActions.includes('DECIDE_APPROVAL') ? (
              <Button variant="secondary" onClick={() => onDecision('REVISION_REQUESTED')}>
                <MessageSquareWarning className="size-4" />
                Request revision
              </Button>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader
          title="Submission history"
          description="Each creative version and decision is permanent."
        />
        {detail.submissions.length ? (
          <div className="divide-y divide-[var(--border)]">
            {detail.submissions.map((submission) => (
              <article key={submission.id} className="px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text)]">
                      Submission {submission.submissionNumber} · {submission.resourceName}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-dim)]">
                      {submission.submittedByName} · {formatDateTime(submission.submittedAt)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      submission.state === 'APPROVED'
                        ? 'success'
                        : submission.state === 'REVISION_REQUESTED'
                          ? 'danger'
                          : 'attention'
                    }
                  >
                    {submission.state.replace('_', ' ')}
                  </Badge>
                </div>
                {submission.decisionComments ? (
                  <blockquote className="mt-4 border-l-2 border-[var(--acid)]/50 pl-4 text-sm leading-6 text-[var(--text-muted)]">
                    {submission.decisionComments}
                  </blockquote>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<ClipboardCheck className="size-5" />}
            title="No submissions yet"
            description="The creator’s submitted versions and approval decisions will appear here."
          />
        )}
      </Card>
    </div>
  );
}

function verificationDetailValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'None';
  return JSON.stringify(value, null, 2);
}

function VerificationHistory({ verifications }: { verifications: PublicationVerification[] }) {
  if (!verifications.length) {
    return (
      <p className="text-xs text-[var(--text-dim)]">
        No verification attempts have been recorded yet.
      </p>
    );
  }

  return (
    <ol className="grid gap-3">
      {verifications.map((verification) => {
        const details = Object.entries(verification.details);
        return (
          <li
            key={verification.id}
            className="rounded-lg border border-[var(--border)] bg-black/10 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge
                tone={
                  verification.status === 'VERIFIED'
                    ? 'success'
                    : verification.status === 'FAILED'
                      ? 'danger'
                      : 'attention'
                }
              >
                {verification.status}
              </Badge>
              <p className="text-xs text-[var(--text-dim)]">
                {verification.method.replaceAll('_', ' ')} ·{' '}
                {formatDateTime(verification.verifiedAt)}
              </p>
            </div>
            {details.length ? (
              <dl className="mt-3 grid gap-2">
                {details.map(([key, value]) => (
                  <div key={key} className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
                    <dt className="text-[10px] font-bold tracking-[0.08em] text-[var(--text-dim)] uppercase">
                      {key.replaceAll('_', ' ')}
                    </dt>
                    <dd className="text-xs leading-5 whitespace-pre-wrap text-[var(--text-muted)]">
                      {verificationDetailValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-xs text-[var(--text-dim)]">No additional details recorded.</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function PublishingSection({
  detail,
  accounts,
  onRequestVerification,
}: {
  detail: PromotionDetail;
  accounts: PublishingAccount[];
  onRequestVerification(id: string): void;
}) {
  const selectedAccountIds = new Set(detail.metadata?.publishingAccountIds ?? []);
  const selectedAccounts = accounts.filter((account) => selectedAccountIds.has(account.id));
  const completedAccounts = selectedAccounts.filter((account) =>
    detail.publications.some((publication) => publication.provider === account.platform),
  );
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Publishing checklist"
          description="Each selected account stays attached to the parent campaign until its publication is recorded."
          action={
            selectedAccounts.length ? (
              <Badge
                tone={
                  completedAccounts.length === selectedAccounts.length ? 'success' : 'attention'
                }
              >
                {completedAccounts.length}/{selectedAccounts.length} complete
              </Badge>
            ) : undefined
          }
        />
        {selectedAccounts.length ? (
          <div className="divide-y divide-[var(--border)]">
            {selectedAccounts.map((account) => {
              const publication = detail.publications.find(
                (item) => item.provider === account.platform,
              );
              return (
                <div
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid size-8 place-items-center rounded-full border text-xs font-bold ${publication ? 'border-[var(--acid)]/40 bg-[var(--acid)]/10 text-[var(--acid-ink)]' : 'border-[var(--border-strong)] text-[var(--text-dim)]'}`}
                    >
                      {publication ? <Check className="size-4" /> : '·'}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {account.accountName}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-dim)]">
                        {publishingChannelLabel[account.platform]} · {account.handle} ·{' '}
                        {account.ownershipType.replaceAll('_', ' ')}
                      </p>
                    </div>
                  </div>
                  {publication ? (
                    <Button asChild variant="secondary" size="sm">
                      <a href={publication.publicationUrl} target="_blank" rel="noreferrer">
                        Open live post <ArrowUpRight className="size-3.5" />
                      </a>
                    </Button>
                  ) : (
                    <Badge tone="attention">Awaiting publication</Badge>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <CardBody>
            <p className="text-sm text-[var(--text-muted)]">
              No channel accounts selected. Edit the campaign brief to build the checklist.
            </p>
          </CardBody>
        )}
      </Card>
      <Card>
        <CardHeader
          title="Publication evidence"
          description="Manual publishing records describe work completed outside this system."
          action={
            detail.publications.length ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(
                      detail.publications
                        .map((publication) => publication.publicationUrl)
                        .join('\n'),
                    )
                    .then(() => toast.success('Published links copied.'))
                    .catch(() => toast.error('Unable to access the clipboard.'));
                }}
              >
                <Copy className="size-3.5" />
                Copy all links
              </Button>
            ) : undefined
          }
        />
        {detail.publications.length ? (
          <div className="divide-y divide-[var(--border)]">
            {detail.publications.map((publication) => (
              <article key={publication.id} className="px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--text)]">
                        {channelName(publication.provider)} · {publication.destination}
                      </h3>
                      {publication.verificationStatus ? (
                        <Badge
                          tone={
                            publication.verificationStatus === 'VERIFIED'
                              ? 'success'
                              : publication.verificationStatus === 'FAILED'
                                ? 'danger'
                                : 'attention'
                          }
                        >
                          {publication.verificationStatus}
                        </Badge>
                      ) : (
                        <Badge tone="attention">UNVERIFIED</Badge>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-dim)]">
                      Published by {publication.publishedByName} ·{' '}
                      {formatDateTime(publication.publishedAt)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Artifact: {publication.artifactName}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(publication.publicationUrl)
                          .then(() => toast.success('Published link copied.'))
                          .catch(() => toast.error('Unable to access the clipboard.'));
                      }}
                    >
                      <Copy className="size-3.5" />
                      Copy link
                    </Button>
                    <Button asChild variant="secondary" size="sm">
                      <a href={publication.publicationUrl} target="_blank" rel="noreferrer">
                        Open publication <ArrowUpRight className="size-3.5" />
                      </a>
                    </Button>
                    {detail.promotion.allowedActions.includes(
                      'REQUEST_PUBLICATION_VERIFICATION',
                    ) ? (
                      <Button size="sm" onClick={() => onRequestVerification(publication.id)}>
                        <ShieldCheck className="size-3.5" />
                        Request verification
                      </Button>
                    ) : null}
                  </div>
                </div>
                <section
                  className="mt-5 border-t border-[var(--border)] pt-5"
                  aria-label={`Verification history for ${channelName(publication.provider)} ${publication.destination}`}
                >
                  <h4 className="mb-3 text-xs font-semibold text-[var(--text)]">
                    Verification history
                  </h4>
                  <VerificationHistory verifications={publication.verifications} />
                </section>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Send className="size-5" />}
            title="No publication recorded"
            description="The assigned publisher records the live URL after publishing externally."
          />
        )}
      </Card>
    </div>
  );
}

function FinanceSection({
  detail,
  canManage,
  onCreate,
  onIssue,
  onSetStatus,
}: {
  detail: PromotionDetail;
  canManage: boolean;
  onCreate(): void;
  onIssue(): void;
  onSetStatus(status: Invoice['status']): void;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Verification evidence"
          description="Every immutable verification attempt supporting the finance handoff."
        />
        {detail.publications.length ? (
          <div className="divide-y divide-[var(--border)]">
            {detail.publications.map((publication) => (
              <section key={publication.id} className="px-5 py-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text)]">
                      {channelName(publication.provider)} · {publication.destination}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-dim)]">
                      Artifact: {publication.artifactName}
                    </p>
                  </div>
                  {publication.verificationStatus ? (
                    <Badge
                      tone={
                        publication.verificationStatus === 'VERIFIED'
                          ? 'success'
                          : publication.verificationStatus === 'FAILED'
                            ? 'danger'
                            : 'attention'
                      }
                    >
                      {publication.verificationStatus}
                    </Badge>
                  ) : (
                    <Badge tone="attention">UNVERIFIED</Badge>
                  )}
                </div>
                <VerificationHistory verifications={publication.verifications} />
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<ShieldCheck className="size-5" />}
            title="No publication evidence"
            description="Verified publication evidence will appear here before invoicing is unlocked."
          />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Finance"
          description="Billing becomes available only after verified publication evidence."
          action={
            detail.promotion.allowedActions.includes('CREATE_INVOICE') ? (
              <Button size="sm" onClick={onCreate}>
                <ReceiptText className="size-3.5" />
                Register invoice
              </Button>
            ) : undefined
          }
        />
        {detail.invoice ? (
          <CardBody>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                  Invoice
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                  {detail.invoice.invoiceNumber ?? 'Draft number pending'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                  Amount
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                  {formatMoney(detail.invoice.amount, detail.invoice.currency)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                  Status
                </p>
                <div className="mt-2">
                  <Badge
                    tone={
                      detail.invoice.status === 'PAID' || detail.invoice.status === 'ISSUED'
                        ? 'success'
                        : 'neutral'
                    }
                  >
                    {detail.invoice.status}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                  Issued
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                  {formatDateTime(detail.invoice.issuedAt)}
                </p>
              </div>
            </div>
            {canManage && ['DRAFT', 'ISSUED'].includes(detail.invoice.status) ? (
              <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--border)] pt-5">
                {detail.invoice.status === 'DRAFT' ? (
                  <Button onClick={onIssue}>
                    <ReceiptText className="size-4" />
                    Issue invoice
                  </Button>
                ) : null}
                {detail.invoice.status === 'ISSUED' ? (
                  <Button
                    onClick={() => {
                      if (window.confirm('Mark this invoice as paid?')) onSetStatus('PAID');
                    }}
                  >
                    <CircleDollarSign className="size-4" />
                    Mark paid
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Mark this invoice as failed? The promotion will return to Ready for invoicing so Finance can register a replacement.',
                      )
                    )
                      onSetStatus('FAILED');
                  }}
                >
                  <MessageSquareWarning className="size-4" />
                  Mark failed
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Void this invoice? The promotion will return to Ready for invoicing so Finance can register a replacement.',
                      )
                    )
                      onSetStatus('VOID');
                  }}
                >
                  <X className="size-4" />
                  Void invoice
                </Button>
              </div>
            ) : null}
          </CardBody>
        ) : (
          <EmptyState
            icon={<CircleDollarSign className="size-5" />}
            title={
              detail.promotion.status === 'READY_FOR_INVOICING'
                ? 'Ready for invoicing'
                : 'Finance is locked'
            }
            description={
              detail.promotion.status === 'READY_FOR_INVOICING'
                ? 'Verification is complete. Register the external invoice or create a local draft.'
                : 'A verified publication is required before an invoice can be created.'
            }
            action={
              detail.promotion.allowedActions.includes('CREATE_INVOICE') ? (
                <Button onClick={onCreate}>Register invoice</Button>
              ) : undefined
            }
          />
        )}
      </Card>
    </div>
  );
}

function ActivitySection({ detail, audit = false }: { detail: PromotionDetail; audit?: boolean }) {
  return (
    <Card>
      <CardHeader
        title={audit ? 'Audit trail' : 'Activity'}
        description={
          audit
            ? 'Immutable event records with correlation references.'
            : 'A chronological narrative of meaningful workflow changes.'
        }
      />
      <CardBody>
        {detail.activity.length ? (
          <ol className="relative space-y-6 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-[var(--border-strong)]">
            {detail.activity.map((event) => (
              <li key={event.id} className="relative pl-8">
                <span className="absolute top-1.5 left-0 z-10 size-[11px] rounded-full border-2 border-[var(--surface-raised)] bg-[var(--acid)]" />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {event.eventType.replace(/([a-z])([A-Z])/g, '$1 $2')}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-dim)]">
                      {event.actorName ?? 'System'} · {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                  {audit ? (
                    <code className="rounded bg-black/30 px-2 py-1 text-[10px] text-[var(--text-dim)]">
                      {event.correlationId}
                    </code>
                  ) : null}
                </div>
                {audit && Object.keys(event.metadata).length ? (
                  <pre className="mt-3 max-w-full overflow-auto rounded-lg border border-[var(--border)] bg-black/20 p-3 text-[10px] leading-5 text-[var(--text-muted)]">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            icon={<History className="size-5" />}
            title="No activity available"
            description="Authorized audit events will appear here."
          />
        )}
      </CardBody>
    </Card>
  );
}

export function PromotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [openingResourceId, setOpeningResourceId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['promotion', profile?.id, id],
    queryFn: () => campaignService.getPromotion(id ?? ''),
    enabled: Boolean(id && profile),
  });
  const accountsQuery = useQuery({
    queryKey: ['publishing-accounts', profile?.id],
    queryFn: () => campaignService.listPublishingAccounts(),
    enabled: Boolean(profile),
  });
  const action = useMutation({
    mutationFn: (request: ActionRequest) => request.run(),
    onSuccess: async (_result, request) => {
      setUploadProgress(0);
      setDialog(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['promotion'] }),
        queryClient.invalidateQueries({ queryKey: ['promotions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
      toast.success(request.success);
    },
    onError: async (error) => {
      setUploadProgress(0);
      toast.error(getFriendlyError(error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['promotion'] }),
        queryClient.invalidateQueries({ queryKey: ['promotions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });

  const openPrivateAsset = (resourceId: string, storagePath: string) => {
    const preview = window.open('about:blank', '_blank');
    if (preview) preview.opener = null;
    setOpeningResourceId(resourceId);
    void campaignService
      .getPrivateAssetUrl(storagePath)
      .then((signedUrl) => {
        if (preview) {
          preview.location.href = signedUrl;
          return;
        }
        const anchor = document.createElement('a');
        anchor.href = signedUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.click();
      })
      .catch((error: unknown) => {
        preview?.close();
        toast.error(getFriendlyError(error));
      })
      .finally(() => setOpeningResourceId(null));
  };

  if (query.isLoading) return <LoadingState label="Loading promotion" />;
  if (query.error || !query.data) {
    const error = toDomainError(query.error);
    return (
      <ErrorState
        title={error.code === 'NOT_FOUND' ? 'Promotion not found' : undefined}
        message={getFriendlyError(error)}
        correlationId={error.correlationId}
        retry={() => void query.refetch()}
      />
    );
  }

  const detail = query.data;
  const promotion = detail.promotion;
  const allowed = promotion.allowedActions;
  const stage = currentStageIndex(promotion.status);
  const pendingSubmission =
    detail.submissions.find((submission) => submission.state === 'PENDING') ?? null;
  const currentPublication = detail.publications[0];
  const canViewFinance = canViewFinanceQueue(profile?.roles ?? []);
  const run = (request: ActionRequest) => action.mutate(request);

  const tabs = [
    { value: 'overview', label: 'Overview' },
    {
      value: 'resources',
      label: 'Resources',
      count: detail.resources.filter((item) => !item.archivedAt).length,
    },
    { value: 'creative', label: 'Creative' },
    { value: 'approval', label: 'Approval', count: detail.submissions.length },
    { value: 'publishing', label: 'Publishing', count: detail.publications.length },
    ...(canViewFinance
      ? [{ value: 'finance', label: 'Finance', count: detail.invoice ? 1 : 0 }]
      : []),
    { value: 'activity', label: 'Activity' },
    { value: 'audit', label: 'Audit' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/promotions">
            <ArrowLeft className="size-3.5" />
            Promotions
          </Link>
        </Button>
      </div>
      <section className="sticky top-16 z-10 rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 shadow-xl lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <PromotionStatusBadge status={promotion.status} />
              <span className="text-xs text-[var(--text-dim)]">v{promotion.version}</span>
            </div>
            <h1 className="mt-3 text-3xl leading-tight font-semibold tracking-[-0.03em] break-words text-[var(--text)]">
              {promotion.title}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-muted)]">
              <span>{promotion.clientName}</span>
              <span className="flex items-center gap-1.5">
                <UserRound className="size-3.5" />
                Owner: {getCurrentOwnerName(promotion)}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                {formatDate(promotion.dueDate)}
              </span>
            </p>
          </div>
          <div className="flex max-w-3xl flex-wrap gap-2">
            <ActionButton
              action="UPDATE_PROMOTION"
              allowed={allowed}
              variant="secondary"
              onClick={() => setDialog({ type: 'edit' })}
            >
              <Pencil className="size-4" />
              Edit promotion
            </ActionButton>
            <ActionButton
              action="ASSIGN_SALES_OWNER"
              allowed={allowed}
              variant="secondary"
              onClick={() => setDialog({ type: 'assign', role: 'SALES_OWNER' })}
            >
              <UserRound className="size-4" />
              Assign sales owner
            </ActionButton>
            <ActionButton
              action="ASSIGN_CREATOR"
              allowed={allowed}
              variant="secondary"
              onClick={() => setDialog({ type: 'assign', role: 'CREATOR' })}
            >
              <UserRound className="size-4" />
              Assign creator
            </ActionButton>
            <ActionButton
              action="ASSIGN_APPROVER"
              allowed={allowed}
              variant="secondary"
              onClick={() => setDialog({ type: 'assign', role: 'APPROVER' })}
            >
              <ShieldCheck className="size-4" />
              Assign approver
            </ActionButton>
            <ActionButton
              action="START_CREATIVE_WORK"
              allowed={allowed}
              onClick={() =>
                run({
                  run: () => campaignService.startCreativeWork(promotion.id, promotion.version),
                  success: 'Creative work started.',
                })
              }
            >
              <Play className="size-4" />
              Start creative
            </ActionButton>
            <ActionButton
              action="ASSIGN_PUBLISHER"
              allowed={allowed}
              variant="secondary"
              onClick={() => setDialog({ type: 'assign', role: 'PUBLISHER' })}
            >
              <UserRound className="size-4" />
              Assign publisher
            </ActionButton>
            <ActionButton
              action="START_PUBLISHING"
              allowed={allowed}
              onClick={() =>
                run({
                  run: () => campaignService.startPublishing(promotion.id, promotion.version),
                  success: 'Publishing started.',
                })
              }
            >
              <Play className="size-4" />
              Start publishing
            </ActionButton>
            <ActionButton
              action="RECORD_PUBLICATION"
              allowed={allowed}
              onClick={() => setDialog({ type: 'publication' })}
            >
              <Send className="size-4" />
              Record publication
            </ActionButton>
            <ActionButton
              action="RECORD_PUBLICATION_VERIFICATION"
              allowed={allowed}
              onClick={() => setDialog({ type: 'verification' })}
            >
              <ShieldCheck className="size-4" />
              Verify publication
            </ActionButton>
            <ActionButton
              action="COMPLETE_VERIFIED_WORKFLOW"
              allowed={allowed}
              onClick={() =>
                run({
                  run: () =>
                    campaignService.completeVerifiedWorkflow(promotion.id, promotion.version),
                  success: 'Promotion is ready for invoicing.',
                })
              }
            >
              <CircleDollarSign className="size-4" />
              Complete verification
            </ActionButton>
            <ActionButton
              action="CREATE_INVOICE"
              allowed={allowed}
              onClick={() => setDialog({ type: 'invoice' })}
            >
              <ReceiptText className="size-4" />
              Register invoice
            </ActionButton>
            <ActionButton
              action="CANCEL_PROMOTION"
              allowed={allowed}
              variant="ghost"
              onClick={() => setDialog({ type: 'cancel' })}
            >
              <X className="size-4" />
              Cancel
            </ActionButton>
          </div>
        </div>
        <ol
          className="mt-6 grid grid-cols-2 gap-x-2 gap-y-3 border-t border-[var(--border)] pt-5 sm:grid-cols-3 lg:grid-cols-6"
          aria-label="Workflow progress"
        >
          {workflowStages.map((item, index) => (
            <li
              key={item.label}
              className={`flex min-w-0 items-center gap-2 text-[10px] font-bold tracking-[0.06em] uppercase ${stage >= index ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}`}
            >
              <span
                className={`grid size-5 place-items-center rounded-full border text-[9px] ${stage > index ? 'border-[var(--acid)] bg-[var(--acid)] text-black' : stage === index ? 'border-[var(--acid)] text-[var(--acid-ink)]' : 'border-[var(--border-strong)]'}`}
              >
                {stage > index ? <Check className="size-3" /> : index + 1}
              </span>
              {item.label}
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
          <span className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
            Who has the ball?
          </span>
          <span className="rounded-md border border-[var(--acid)]/25 bg-[var(--acid)]/8 px-3 py-1.5 text-xs font-semibold text-[var(--acid-ink)]">
            {getCurrentOwnerName(promotion)}
          </span>
          <span className="text-xs text-[var(--text-dim)]">
            Next handoff follows the current workflow stage.
          </span>
        </div>
      </section>

      <Tabs.Root defaultValue="overview">
        <Tabs.List
          className="flex gap-1 overflow-x-auto border-b border-[var(--border)]"
          aria-label="Promotion sections"
        >
          {tabs.map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className="flex min-h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-[var(--text-dim)] transition hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none data-[state=active]:border-[var(--acid)] data-[state=active]:text-[var(--text)]"
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span className="rounded-full bg-white/7 px-1.5 py-0.5 text-[10px]">
                  {tab.count}
                </span>
              ) : null}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="overview" className="mt-6 focus-visible:outline-none">
          <OverviewSection detail={detail} />
        </Tabs.Content>
        <Tabs.Content value="resources" className="mt-6 focus-visible:outline-none">
          <ResourcesSection
            detail={detail}
            canAttach={allowed.includes('ATTACH_RESOURCE')}
            onAdd={() => setDialog({ type: 'resource' })}
            onOpenPrivate={openPrivateAsset}
            openingResourceId={openingResourceId}
            onArchive={(resourceId) => {
              if (
                window.confirm(
                  'Archive this resource? Existing workflow history will be preserved.',
                )
              )
                run({
                  run: () => campaignService.archiveResource(resourceId),
                  success: 'Resource archived.',
                });
            }}
            onSubmit={(resourceId) =>
              run({
                run: () =>
                  campaignService.submitForApproval(promotion.id, resourceId, promotion.version),
                success: 'Creative submitted for approval.',
              })
            }
          />
        </Tabs.Content>
        <Tabs.Content value="creative" className="mt-6 focus-visible:outline-none">
          <CreativeSection
            detail={detail}
            onStart={() =>
              run({
                run: () => campaignService.startCreativeWork(promotion.id, promotion.version),
                success: 'Creative work started.',
              })
            }
            onSubmit={(resourceId) =>
              run({
                run: () =>
                  campaignService.submitForApproval(promotion.id, resourceId, promotion.version),
                success: 'Creative submitted for approval.',
              })
            }
          />
        </Tabs.Content>
        <Tabs.Content value="approval" className="mt-6 focus-visible:outline-none">
          <ApprovalSection
            detail={detail}
            onDecision={(decision) => setDialog({ type: 'approve', decision })}
          />
        </Tabs.Content>
        <Tabs.Content value="publishing" className="mt-6 focus-visible:outline-none">
          <PublishingSection
            detail={detail}
            accounts={accountsQuery.data ?? []}
            onRequestVerification={(publicationId) =>
              run({
                run: () => campaignService.requestVerification(publicationId, promotion.version),
                success: 'Verification requested.',
              })
            }
          />
        </Tabs.Content>
        {canViewFinance ? (
          <Tabs.Content value="finance" className="mt-6 focus-visible:outline-none">
            <FinanceSection
              detail={detail}
              canManage={hasAnyRole(profile?.roles ?? [], ['FINANCE'])}
              onCreate={() => setDialog({ type: 'invoice' })}
              onIssue={() => setDialog({ type: 'issue-invoice' })}
              onSetStatus={(status) => {
                if (!detail.invoice) return;
                run({
                  run: () =>
                    campaignService.setInvoiceStatus(detail.invoice!.id, status, promotion.version),
                  success:
                    status === 'PAID' ? 'Invoice marked as paid.' : 'Invoice status updated.',
                });
              }}
            />
          </Tabs.Content>
        ) : null}
        <Tabs.Content value="activity" className="mt-6 focus-visible:outline-none">
          <ActivitySection detail={detail} />
        </Tabs.Content>
        <Tabs.Content value="audit" className="mt-6 focus-visible:outline-none">
          <ActivitySection detail={detail} audit />
        </Tabs.Content>
      </Tabs.Root>

      {dialog?.type === 'assign' ? (
        <AssignmentDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          pending={action.isPending}
          role={dialog.role}
          onSubmit={(userId) =>
            run({
              run: () =>
                campaignService.assignRole(promotion.id, dialog.role, userId, promotion.version),
              success: `${dialog.role.replace('_', ' ').toLowerCase()} assigned.`,
            })
          }
        />
      ) : null}
      {dialog?.type === 'edit' ? (
        <PromotionEditDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          pending={action.isPending}
          promotion={promotion}
          onSubmit={(input: PromotionEditInput) =>
            run({
              run: () => campaignService.updatePromotion(promotion.id, promotion.version, input),
              success: 'Promotion updated.',
            })
          }
        />
      ) : null}
      <ResourceDialog
        open={dialog?.type === 'resource'}
        onOpenChange={(open) => !open && setDialog(null)}
        pending={action.isPending}
        uploadProgress={uploadProgress}
        onSubmit={(input: ResourceLinkInput) =>
          run({
            run: () => campaignService.attachResource(promotion.id, input),
            success: 'Resource attached and queued for validation.',
          })
        }
        onUpload={(file) =>
          run({
            run: () => campaignService.attachPrivateAsset(promotion.id, file, setUploadProgress),
            success: 'Private asset uploaded securely.',
          })
        }
      />
      {dialog?.type === 'approve' ? (
        <ApprovalDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          pending={action.isPending}
          submission={pendingSubmission}
          initialDecision={dialog.decision}
          onSubmit={(input) => {
            if (!pendingSubmission) return;
            run({
              run: () =>
                campaignService.decideApproval(pendingSubmission.id, input, promotion.version),
              success: input.decision === 'APPROVED' ? 'Creative approved.' : 'Revision requested.',
            });
          }}
        />
      ) : null}
      <PublicationDialog
        open={dialog?.type === 'publication'}
        onOpenChange={(open) => !open && setDialog(null)}
        pending={action.isPending}
        resources={getApprovedPublicationResources(detail)}
        onSubmit={(input: PublicationInput) =>
          run({
            run: () => campaignService.recordPublication(promotion.id, input, promotion.version),
            success: 'Publication recorded.',
          })
        }
      />
      <VerificationDialog
        open={dialog?.type === 'verification'}
        onOpenChange={(open) => !open && setDialog(null)}
        pending={action.isPending}
        onSubmit={(input: VerificationInput) => {
          if (!currentPublication) return;
          run({
            run: () =>
              campaignService.recordVerification(currentPublication.id, input, promotion.version),
            success:
              input.status === 'VERIFIED'
                ? 'Publication verified and finance notified.'
                : 'Verification attempt recorded.',
          });
        }}
      />
      <InvoiceDialog
        open={dialog?.type === 'invoice'}
        onOpenChange={(open) => !open && setDialog(null)}
        pending={action.isPending}
        onSubmit={(input: InvoiceInput) =>
          run({
            run: () => campaignService.createInvoice(promotion.id, input, promotion.version),
            success: 'Invoice registered.',
          })
        }
      />
      {dialog?.type === 'issue-invoice' && detail.invoice ? (
        <IssueInvoiceDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          pending={action.isPending}
          onSubmit={(input) =>
            run({
              run: () =>
                campaignService.setInvoiceStatus(
                  detail.invoice!.id,
                  'ISSUED',
                  promotion.version,
                  input.invoiceNumber,
                ),
              success: 'Invoice issued.',
            })
          }
        />
      ) : null}
      <CancellationDialog
        open={dialog?.type === 'cancel'}
        onOpenChange={(open) => !open && setDialog(null)}
        pending={action.isPending}
        onSubmit={(reason) =>
          run({
            run: () => campaignService.cancelPromotion(promotion.id, promotion.version, reason),
            success: 'Promotion cancelled.',
          })
        }
      />

      {action.isPending ? (
        <div className="fixed right-5 bottom-5 z-[60] flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-3 text-xs text-[var(--text-muted)] shadow-xl">
          <LoaderCircle className="size-4 animate-spin text-[var(--acid-ink)]" />
          Saving workflow change…
        </div>
      ) : null}
    </div>
  );
}
