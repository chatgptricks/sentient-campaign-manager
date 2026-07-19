import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { Client } from '../../domain/models';
import { getFriendlyError } from '../../domain/errors';
import { campaignService } from '../../lib/data';
import { clientSchema, type ClientInput } from '../../lib/validation/schemas';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input, Textarea } from '../../components/ui/Field';

export function ClientFormDialog({
  trigger,
  client,
  onCreated,
  onSaved,
}: {
  trigger: ReactNode;
  client?: Client;
  onCreated?: (client: Client) => void;
  onSaved?: (client: Client) => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<ClientInput>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: client?.name ?? '',
      billingEmail: client?.billingEmail ?? '',
      billingAddress: client?.billingAddress ?? '',
    },
  });
  useEffect(() => {
    if (open) {
      form.reset({
        name: client?.name ?? '',
        billingEmail: client?.billingEmail ?? '',
        billingAddress: client?.billingAddress ?? '',
      });
    }
  }, [client, form, open]);
  const mutation = useMutation({
    mutationFn: (input: ClientInput) =>
      client ? campaignService.updateClient(client.id, input) : campaignService.createClient(input),
    onSuccess: async (savedClient) => {
      queryClient.setQueriesData<Client[]>({ queryKey: ['clients'] }, (current) => {
        if (!current) return [savedClient];
        const withoutDuplicate = current.filter((item) => item.id !== savedClient.id);
        return [...withoutDuplicate, savedClient].sort((left, right) =>
          left.name.localeCompare(right.name),
        );
      });
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(`${savedClient.name} was ${client ? 'updated' : 'added'}.`);
      form.reset();
      setOpen(false);
      onCreated?.(savedClient);
      onSaved?.(savedClient);
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={client ? 'Edit client' : 'Add client'}
      description={
        client
          ? 'Keep the shared client and billing details accurate for future promotions.'
          : 'Create the client record before starting a promotion. Billing details can be completed later.'
      }
    >
      <form className="grid gap-5" onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
        <Field
          label="Client name"
          htmlFor="client-name"
          error={form.formState.errors.name?.message}
        >
          <Input
            id="client-name"
            autoComplete="organization"
            aria-invalid={Boolean(form.formState.errors.name)}
            {...form.register('name')}
          />
        </Field>
        <Field
          label="Billing email"
          htmlFor="billing-email"
          error={form.formState.errors.billingEmail?.message}
          hint="Optional for now."
        >
          <Input
            id="billing-email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(form.formState.errors.billingEmail)}
            {...form.register('billingEmail')}
          />
        </Field>
        <Field
          label="Billing address"
          htmlFor="billing-address"
          error={form.formState.errors.billingAddress?.message}
          hint="Optional for now."
        >
          <Textarea
            id="billing-address"
            autoComplete="street-address"
            aria-invalid={Boolean(form.formState.errors.billingAddress)}
            {...form.register('billingAddress')}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? client
                ? 'Saving…'
                : 'Adding…'
              : client
                ? 'Save changes'
                : 'Add client'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
