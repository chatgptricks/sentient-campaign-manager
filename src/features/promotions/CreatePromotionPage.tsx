import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Plus } from 'lucide-react';
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

export function CreatePromotionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const clientsQuery = useQuery({
    queryKey: ['clients', profile?.id],
    queryFn: () => campaignService.listClients(),
    enabled: Boolean(profile),
  });
  const salesQuery = useQuery({
    queryKey: ['profiles', profile?.id, 'SALES'],
    queryFn: () => campaignService.listProfiles('SALES'),
    enabled: Boolean(profile),
  });
  const form = useForm<PromotionInput>({
    resolver: zodResolver(promotionSchema),
    defaultValues: { clientId: '', title: '', description: '', dueDate: '', salesOwnerId: '' },
  });

  useEffect(() => {
    if (!form.getValues('salesOwnerId') && profile?.roles.includes('SALES')) {
      form.setValue('salesOwnerId', profile.id);
    }
  }, [form, profile]);

  const mutation = useMutation({
    mutationFn: campaignService.createPromotion,
    onSuccess: async (promotion) => {
      await queryClient.invalidateQueries({ queryKey: ['promotions'] });
      toast.success('Promotion created.');
      navigate(`/promotions/${promotion.id}`);
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });

  if (clientsQuery.isLoading || salesQuery.isLoading)
    return <LoadingState label="Preparing promotion form" />;
  if (clientsQuery.error || salesQuery.error) {
    return (
      <ErrorState
        message={getFriendlyError(clientsQuery.error ?? salesQuery.error)}
        retry={() => {
          void clientsQuery.refetch();
          void salesQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Sales intake"
        title="Create promotion"
        description="Start the promotion in Draft. You can attach resources and assign the production team next."
        actions={
          <Button asChild variant="ghost">
            <Link to="/promotions">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        }
      />
      <Card>
        <CardHeader
          title="Promotion brief"
          description="Required information for the first workflow record."
        />
        <CardBody>
          <form
            className="grid gap-6"
            onSubmit={form.handleSubmit((input) => mutation.mutate(input))}
          >
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
              label="Promotion title"
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
                placeholder="Campaign objective, formats, channels, and constraints…"
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
                label="Sales owner"
                htmlFor="promotion-sales-owner"
                error={form.formState.errors.salesOwnerId?.message}
              >
                <Select
                  id="promotion-sales-owner"
                  aria-invalid={Boolean(form.formState.errors.salesOwnerId)}
                  {...form.register('salesOwnerId')}
                >
                  <option value="">Choose an owner</option>
                  {salesQuery.data?.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-6">
              <Button asChild variant="ghost">
                <Link to="/promotions">Cancel</Link>
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                <Plus className="size-4" />
                {mutation.isPending ? 'Creating…' : 'Create promotion'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
