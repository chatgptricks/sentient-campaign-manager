import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Building2, Check, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { campaignService } from '../../lib/data';
import { getFriendlyError } from '../../domain/errors';
import { publishingChannelLabel, publishingChannels } from '../../domain/channels';
import { promotionSchema, type PromotionInput } from '../../lib/validation/schemas';
import type { PublishingAccount } from '../../domain/models';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHeader } from '../../components/ui/PageHeader';
import { ClientFormDialog } from '../clients/ClientFormDialog';
import { useAuth } from '../auth/AuthProvider';
import {
  getSelectablePublishingAccounts,
  prunePublishingAccountIds,
} from './channel-account-selection';

type Step = 1 | 2;

const steps: { value: Step; label: string }[] = [
  { value: 1, label: 'Promotion details' },
  { value: 2, label: 'Channels & accounts' },
];

const detailFields: FieldPath<PromotionInput>[] = [
  'clientId',
  'title',
  'description',
  'dueDate',
  'metadata.campaignType',
  'metadata.priority',
  'metadata.scheduledDate',
  'metadata.briefUrl',
  'metadata.clientMaterialLinks',
  'metadata.externalResourceLinks',
  'metadata.internalNotes',
];

function StepIndicator({ current }: { current: Step }) {
  return (
    <ol className="flex flex-wrap items-center gap-3" aria-label="Create promotion progress">
      {steps.map((step, index) => {
        const done = current > step.value;
        const active = current === step.value;
        return (
          <li key={step.value} className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  active
                    ? 'bg-[var(--acid)] text-black'
                    : done
                      ? 'bg-[var(--acid)]/15 text-[var(--acid-ink)]'
                      : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)]'
                }`}
              >
                {done ? <Check className="size-3.5" /> : step.value}
              </span>
              <span
                className={`text-xs font-semibold ${
                  active ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className="h-px w-8 bg-[var(--border)] sm:w-12" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function CreatePromotionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const calendarDueDate = searchParams.get('dueDate') ?? '';
  const clientsQuery = useQuery({
    queryKey: ['clients', profile?.id],
    queryFn: () => campaignService.listClients(),
    enabled: Boolean(profile),
  });
  const accountsQuery = useQuery({
    queryKey: ['publishing-accounts', profile?.id],
    queryFn: () => campaignService.listPublishingAccounts(),
    enabled: Boolean(profile),
  });
  const form = useForm<PromotionInput>({
    resolver: zodResolver(promotionSchema),
    defaultValues: {
      clientId: '',
      title: '',
      description: '',
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(calendarDueDate) ? calendarDueDate : '',
      metadata: {
        campaignType: 'Social promotion',
        scheduledDate: /^\d{4}-\d{2}-\d{2}$/.test(calendarDueDate) ? calendarDueDate : '',
        priority: 'NORMAL',
        briefUrl: '',
        clientMaterialLinks: '',
        externalResourceLinks: '',
        platforms: ['INSTAGRAM'],
        publishingAccountIds: [],
        externalPartnerAccountIds: [],
        internalNotes: '',
      },
    },
  });

  const mutation = useMutation({
    mutationFn: campaignService.createPromotion,
    onSuccess: async (promotion) => {
      await queryClient.invalidateQueries({ queryKey: ['promotions'] });
      toast.success('Promotion created.');
      navigate(`/promotions/${promotion.id}`);
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });

  const submit = form.handleSubmit((input) => mutation.mutate(input));

  async function goToChannels() {
    if (await form.trigger(detailFields)) setStep(2);
  }

  if (clientsQuery.isLoading || accountsQuery.isLoading)
    return <LoadingState label="Preparing promotion form" />;
  if (clientsQuery.error || accountsQuery.error) {
    return (
      <ErrorState
        message={getFriendlyError(clientsQuery.error ?? accountsQuery.error)}
        retry={() => {
          void clientsQuery.refetch();
          void accountsQuery.refetch();
        }}
      />
    );
  }

  const selectedPlatforms = form.watch('metadata.platforms') ?? [];
  const visibleAccounts = getSelectablePublishingAccounts(
    accountsQuery.data ?? [],
    selectedPlatforms,
  );
  const selectedClient = clientsQuery.data?.find(
    (client) => client.id === form.getValues('clientId'),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Sales intake"
        title="Create promotion"
        description={
          step === 1
            ? 'Start the promotion in Draft with the brief, dates, and production context.'
            : 'Choose the channels and accounts that become the publishing checklist.'
        }
        actions={
          <Button asChild variant="ghost">
            <Link to="/promotions">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        }
      />

      <StepIndicator current={step} />

      <Card>
        <CardHeader
          title={step === 1 ? 'Promotion brief' : 'Publishing network'}
          description={
            step === 1
              ? 'Required information for the first workflow record.'
              : selectedClient
                ? `${selectedClient.name} · ${form.getValues('title')}`
                : form.getValues('title')
          }
        />
        <CardBody>
          <form
            className="grid gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (step === 1) {
                void goToChannels();
                return;
              }
              void submit(event);
            }}
          >
            {step === 1 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Field
                    label="Client"
                    htmlFor="promotion-client"
                    error={form.formState.errors.clientId?.message}
                  >
                    <Select
                      id="promotion-client"
                      aria-invalid={Boolean(form.formState.errors.clientId)}
                      {...form.register('clientId')}
                    >
                      <option value="">Choose a client</option>
                      {clientsQuery.data?.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <ClientFormDialog
                    trigger={
                      <Button type="button" variant="secondary">
                        <Building2 className="size-4" />
                        Add client
                      </Button>
                    }
                    onCreated={(client) =>
                      form.setValue('clientId', client.id, { shouldValidate: true })
                    }
                  />
                </div>
                <Field
                  label="Promotion name"
                  htmlFor="promotion-title"
                  error={form.formState.errors.title?.message}
                >
                  <Input
                    id="promotion-title"
                    placeholder="e.g. Summer rooftop launch"
                    aria-invalid={Boolean(form.formState.errors.title)}
                    {...form.register('title')}
                  />
                </Field>
                <Field
                  label="Description"
                  htmlFor="promotion-description"
                  error={form.formState.errors.description?.message}
                  hint="Give the production team enough context to understand the objective and deliverables."
                >
                  <Textarea
                    id="promotion-description"
                    placeholder="Promotion objective, formats, channels, and constraints…"
                    aria-invalid={Boolean(form.formState.errors.description)}
                    {...form.register('description')}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Due date"
                    htmlFor="promotion-due-date"
                    error={form.formState.errors.dueDate?.message}
                  >
                    <Input
                      id="promotion-due-date"
                      type="date"
                      aria-invalid={Boolean(form.formState.errors.dueDate)}
                      {...form.register('dueDate')}
                    />
                  </Field>
                  <Field
                    label="Scheduled publishing date"
                    htmlFor="promotion-scheduled-date"
                    error={form.formState.errors.metadata?.scheduledDate?.message}
                  >
                    <Input
                      id="promotion-scheduled-date"
                      type="date"
                      {...form.register('metadata.scheduledDate')}
                    />
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Promotion type"
                    htmlFor="promotion-campaign-type"
                    error={form.formState.errors.metadata?.campaignType?.message}
                  >
                    <Input
                      id="promotion-campaign-type"
                      {...form.register('metadata.campaignType')}
                    />
                  </Field>
                  <Field
                    label="Priority"
                    htmlFor="promotion-priority"
                    error={form.formState.errors.metadata?.priority?.message}
                  >
                    <Select id="promotion-priority" {...form.register('metadata.priority')}>
                      <option value="LOW">Low</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </Select>
                  </Field>
                </div>
                <Field
                  label="Brief link"
                  htmlFor="promotion-brief-link"
                  error={form.formState.errors.metadata?.briefUrl?.message}
                  hint="Use a Canva, Google Docs, or Drive HTTPS link."
                >
                  <Input
                    id="promotion-brief-link"
                    type="url"
                    placeholder="https://…"
                    {...form.register('metadata.briefUrl')}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Client material links"
                    htmlFor="promotion-client-materials"
                    hint="One HTTPS link per line."
                  >
                    <Textarea
                      id="promotion-client-materials"
                      placeholder="https://drive.google.com/…"
                      {...form.register('metadata.clientMaterialLinks')}
                    />
                  </Field>
                  <Field
                    label="Other resource links"
                    htmlFor="promotion-other-resources"
                    hint="One HTTPS link per line."
                  >
                    <Textarea
                      id="promotion-other-resources"
                      placeholder="https://…"
                      {...form.register('metadata.externalResourceLinks')}
                    />
                  </Field>
                </div>
                <Field
                  label="Internal notes"
                  htmlFor="promotion-internal-notes"
                  hint="Visible to the internal operations team only."
                >
                  <Textarea
                    id="promotion-internal-notes"
                    {...form.register('metadata.internalNotes')}
                  />
                </Field>
                <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-6">
                  <Button asChild variant="ghost">
                    <Link to="/promotions">Cancel</Link>
                  </Button>
                  <Button type="submit">
                    Continue
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Field
                  label="Channels"
                  htmlFor="promotion-platforms"
                  error={form.formState.errors.metadata?.platforms?.message}
                  hint="Select every channel that will receive a publishing checklist item."
                >
                  <div id="promotion-platforms" className="grid gap-2 sm:grid-cols-3">
                    {publishingChannels.map((platform) => (
                      <label
                        key={platform}
                        className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text-muted)]"
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--acid)]"
                          checked={(form.watch('metadata.platforms') ?? []).includes(platform)}
                          onChange={(event) => {
                            const current = form.getValues('metadata.platforms') ?? [];
                            const nextPlatforms = event.target.checked
                              ? [...current, platform]
                              : current.filter((item) => item !== platform);
                            form.setValue('metadata.platforms', nextPlatforms, {
                              shouldValidate: true,
                            });
                            if (!event.target.checked) {
                              form.setValue(
                                'metadata.publishingAccountIds',
                                prunePublishingAccountIds(
                                  form.getValues('metadata.publishingAccountIds') ?? [],
                                  accountsQuery.data ?? [],
                                  nextPlatforms,
                                ),
                                { shouldValidate: true },
                              );
                            }
                          }}
                        />
                        {publishingChannelLabel[platform]}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field
                  label="Channel accounts"
                  htmlFor="promotion-publishing-accounts"
                  hint="Choose the predefined accounts that become the promotion checklist."
                >
                  {selectedPlatforms.length ? (
                    visibleAccounts.length ? (
                      <div id="promotion-publishing-accounts" className="grid gap-2 sm:grid-cols-2">
                        {visibleAccounts.map((account: PublishingAccount) => {
                          const selected = (
                            form.watch('metadata.publishingAccountIds') ?? []
                          ).includes(account.id);
                          return (
                            <label
                              key={account.id}
                              className={`flex min-h-12 items-center justify-between gap-3 rounded-md border px-3 text-xs ${selected ? 'border-[var(--acid)]/50 bg-[var(--acid)]/8 text-[var(--text)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'}`}
                            >
                              <span>
                                <span className="block font-semibold">{account.accountName}</span>
                                <span className="mt-1 block text-[10px] text-[var(--text-dim)]">
                                  {publishingChannelLabel[account.platform]} · {account.handle}
                                  {account.active ? '' : ' · Inactive'}
                                </span>
                              </span>
                              <input
                                type="checkbox"
                                className="size-4 accent-[var(--acid)]"
                                checked={selected}
                                disabled={!account.active}
                                onChange={(event) => {
                                  const current =
                                    form.getValues('metadata.publishingAccountIds') ?? [];
                                  form.setValue(
                                    'metadata.publishingAccountIds',
                                    event.target.checked
                                      ? [...current, account.id]
                                      : current.filter((id) => id !== account.id),
                                    { shouldValidate: true },
                                  );
                                }}
                              />
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p
                        id="promotion-publishing-accounts"
                        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-xs text-[var(--text-muted)]"
                      >
                        No active accounts are configured for the selected channels.
                      </p>
                    )
                  ) : (
                    <p
                      id="promotion-publishing-accounts"
                      className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-xs text-[var(--text-muted)]"
                    >
                      Select a channel to choose its accounts.
                    </p>
                  )}
                </Field>
                <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-6">
                  <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                    <ArrowLeft className="size-4" />
                    Back to details
                  </Button>
                  <Button type="submit" disabled={mutation.isPending}>
                    <Plus className="size-4" />
                    {mutation.isPending ? 'Creating…' : 'Create promotion'}
                  </Button>
                </div>
              </>
            )}
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
