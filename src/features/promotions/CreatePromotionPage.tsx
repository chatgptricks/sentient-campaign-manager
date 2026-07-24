import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Building2, Check, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { campaignService } from '../../lib/data';
import { getFriendlyError } from '../../domain/errors';
import { promotionSchema, type PromotionInput } from '../../lib/validation/schemas';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHeader } from '../../components/ui/PageHeader';
import { ClientFormDialog } from '../clients/ClientFormDialog';
import { useAuth } from '../auth/AuthProvider';

type Step = 1 | 2;
type DetailSnapshot = Pick<PromotionInput, 'clientId' | 'description' | 'dueDate' | 'title'> & {
  metadata: Pick<
    NonNullable<PromotionInput['metadata']>,
    | 'briefUrl'
    | 'campaignType'
    | 'clientMaterialLinks'
    | 'externalResourceLinks'
    | 'internalNotes'
    | 'priority'
    | 'scheduledDate'
  >;
};

const steps: { value: Step; label: string }[] = [
  { value: 1, label: 'Promotion details' },
  { value: 2, label: 'Google Sheet' },
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
  const [detailSnapshot, setDetailSnapshot] = useState<DetailSnapshot | null>(null);
  const calendarDueDate = searchParams.get('dueDate') ?? '';
  const clientsQuery = useQuery({
    queryKey: ['clients', profile?.id],
    queryFn: () => campaignService.listClients(),
    enabled: Boolean(profile),
  });
  const form = useForm<PromotionInput>({
    resolver: zodResolver(promotionSchema),
    shouldUnregister: false,
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
        publishingSheetUrl: '',
        internalNotes: '',
      },
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: PromotionInput) => {
      const promotion = await campaignService.createPromotion(input);
      const sheetUrl = input.metadata?.publishingSheetUrl?.trim();
      if (sheetUrl && import.meta.env.VITE_E2E_SKIP_GOOGLE_SHEET_SYNC !== 'true') {
        await campaignService.syncPromotionChannelSheet(promotion.id, sheetUrl);
      }
      return promotion;
    },
    onSuccess: async (promotion) => {
      await queryClient.invalidateQueries({ queryKey: ['promotions'] });
      toast.success('Promotion created.');
      navigate(`/promotions/${promotion.id}`);
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });

  async function submitPromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sheetUrl = form.getValues('metadata.publishingSheetUrl')?.trim();
    if (!sheetUrl) {
      form.setError('metadata.publishingSheetUrl', {
        message: 'Paste the Google Sheet link.',
        type: 'required',
      });
      return;
    }
    if (!(await form.trigger('metadata.publishingSheetUrl'))) return;
    void form.handleSubmit((input) => mutation.mutate(input))(event);
  }

  async function goToChannels() {
    if (await form.trigger(detailFields)) {
      const values = form.getValues();
      setDetailSnapshot({
        clientId: values.clientId,
        description: values.description,
        dueDate: values.dueDate,
        title: values.title,
        metadata: {
          briefUrl: values.metadata?.briefUrl ?? '',
          campaignType: values.metadata?.campaignType ?? 'Social promotion',
          clientMaterialLinks: values.metadata?.clientMaterialLinks ?? '',
          externalResourceLinks: values.metadata?.externalResourceLinks ?? '',
          internalNotes: values.metadata?.internalNotes ?? '',
          priority: values.metadata?.priority ?? 'NORMAL',
          scheduledDate: values.metadata?.scheduledDate ?? '',
        },
      });
      setStep(2);
    }
  }

  function backToDetails() {
    if (detailSnapshot) {
      form.setValue('clientId', detailSnapshot.clientId);
      form.setValue('description', detailSnapshot.description);
      form.setValue('dueDate', detailSnapshot.dueDate);
      form.setValue('title', detailSnapshot.title);
      for (const [key, value] of Object.entries(detailSnapshot.metadata)) {
        form.setValue(
          `metadata.${key}` as FieldPath<PromotionInput>,
          value as PromotionInput[keyof PromotionInput],
        );
      }
    }
    setStep(1);
  }

  if (clientsQuery.isLoading) return <LoadingState label="Preparing promotion form" />;
  if (clientsQuery.error) {
    return (
      <ErrorState
        message={getFriendlyError(clientsQuery.error)}
        retry={() => {
          void clientsQuery.refetch();
        }}
      />
    );
  }

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
            : 'Paste the Google Sheet that becomes the editable publishing checklist.'
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
          title={step === 1 ? 'Promotion brief' : 'Publishing Sheet'}
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
              void submitPromotion(event);
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
                  label="Google Sheet link"
                  htmlFor="promotion-publishing-sheet"
                  error={form.formState.errors.metadata?.publishingSheetUrl?.message}
                  hint="Paste any editable Google Sheet. The first row becomes the table headers inside the CRM."
                >
                  <Input
                    id="promotion-publishing-sheet"
                    type="url"
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    {...form.register('metadata.publishingSheetUrl')}
                  />
                </Field>
                <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-6">
                  <Button type="button" variant="ghost" onClick={backToDetails}>
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
