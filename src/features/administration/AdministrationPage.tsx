import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Activity,
  Cable,
  CircleAlert,
  CircleCheck,
  KeyRound,
  MailPlus,
  Play,
  RefreshCw,
  Settings2,
  Shield,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import type { Profile } from '../../domain/models';
import { assignableRoleCodes, roleLabel, type RoleCode } from '../../domain/permissions';
import { campaignService } from '../../lib/data';
import { getFriendlyError } from '../../domain/errors';
import {
  createUserSchema,
  inviteUserSchema,
  type CreateUserInput,
  type InviteUserInput,
} from '../../lib/validation/schemas';
import { formatDateTime } from '../../lib/utils';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { ErrorState } from '../../components/ui/ErrorState';
import { Field, Input, Select } from '../../components/ui/Field';
import { LoadingState } from '../../components/ui/LoadingState';
import { MetricCard } from '../../components/ui/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuth } from '../auth/AuthProvider';

type AssignableRoleCode = (typeof assignableRoleCodes)[number];

function isAssignableRole(role: RoleCode | undefined): role is AssignableRoleCode {
  return Boolean(role && (assignableRoleCodes as readonly RoleCode[]).includes(role));
}

function RoleSelect({
  value,
  onChange,
}: {
  value?: RoleCode;
  onChange(role: AssignableRoleCode): void;
}) {
  return (
    <Field label="Application role" htmlFor="application-role">
      <Select
        id="application-role"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value as AssignableRoleCode)}
      >
        <option value="" disabled>
          Select role level
        </option>
        {assignableRoleCodes.map((role) => (
          <option key={role} value={role}>
            {roleLabel[role]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function InviteUserDialog({ onInvited }: { onInvited(): void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { displayName: '', email: '', roles: [] },
  });
  const mutation = useMutation({
    mutationFn: campaignService.inviteUser,
    onSuccess: () => {
      toast.success('Invitation created.');
      setOpen(false);
      form.reset();
      onInvited();
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });
  const roles = form.watch('roles');
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) form.reset();
      }}
      trigger={
        <Button variant="secondary">
          <MailPlus className="size-4" />
          Invite user
        </Button>
      }
      title="Invite team member"
      description="Public signup is disabled. Administrators invite users and assign their application role level."
    >
      <form className="grid gap-5" onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
        <Field
          label="Display name"
          htmlFor="invite-name"
          error={form.formState.errors.displayName?.message}
        >
          <Input id="invite-name" autoComplete="name" {...form.register('displayName')} />
        </Field>
        <Field label="Email" htmlFor="invite-email" error={form.formState.errors.email?.message}>
          <Input id="invite-email" type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <RoleSelect
          value={roles[0]}
          onChange={(role) => form.setValue('roles', [role], { shouldValidate: true })}
        />
        {form.formState.errors.roles?.message ? (
          <p className="text-xs text-red-300">{form.formState.errors.roles.message}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpen(false);
              form.reset();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Inviting…' : 'Send invitation'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CreateUserDialog({ onCreated }: { onCreated(): void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { displayName: '', email: '', temporaryPassword: '', roles: [] },
  });
  const mutation = useMutation({
    mutationFn: campaignService.createUser,
    onSuccess: () => {
      toast.success('User created. They must change the temporary password on first login.');
      setOpen(false);
      form.reset();
      onCreated();
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });
  const roles = form.watch('roles');
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) form.reset();
      }}
      trigger={
        <Button>
          <KeyRound className="size-4" />
          Create user
        </Button>
      }
      title="Create team member"
      description="Create the account directly with a temporary password. The user must replace it on first login."
    >
      <form className="grid gap-5" onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
        <Field
          label="Display name"
          htmlFor="create-user-name"
          error={form.formState.errors.displayName?.message}
        >
          <Input id="create-user-name" autoComplete="name" {...form.register('displayName')} />
        </Field>
        <Field
          label="Email"
          htmlFor="create-user-email"
          error={form.formState.errors.email?.message}
        >
          <Input
            id="create-user-email"
            type="email"
            autoComplete="email"
            {...form.register('email')}
          />
        </Field>
        <Field
          label="Temporary password"
          htmlFor="create-user-password"
          hint="At least 10 characters, including a letter and a number."
          error={form.formState.errors.temporaryPassword?.message}
        >
          <Input
            id="create-user-password"
            type="password"
            autoComplete="new-password"
            {...form.register('temporaryPassword')}
          />
        </Field>
        <RoleSelect
          value={roles[0]}
          onChange={(role) => form.setValue('roles', [role], { shouldValidate: true })}
        />
        {form.formState.errors.roles?.message ? (
          <p className="text-xs text-red-300">{form.formState.errors.roles.message}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpen(false);
              form.reset();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ManageUserDialog({
  user,
  open,
  onOpenChange,
  onSaved,
}: {
  user: Profile | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSaved(): void;
}) {
  const [roles, setRoles] = useState<AssignableRoleCode[]>(
    isAssignableRole(user?.roles[0]) ? [user.roles[0]] : [],
  );
  const [status, setStatus] = useState<Profile['status']>(user?.status ?? 'ACTIVE');
  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await campaignService.replaceUserRoles(user.id, roles);
      if (status !== user.status) await campaignService.setProfileStatus(user.id, status);
    },
    onSuccess: () => {
      toast.success('User access updated.');
      onOpenChange(false);
      onSaved();
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Manage ${user?.displayName ?? 'user'}`}
      description="Role and status changes are authorized and written to the audit log."
    >
      <div className="grid gap-5">
        <Field label="Account status" htmlFor="profile-status">
          <Select
            id="profile-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as Profile['status'])}
          >
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Invited</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
        </Field>
        <RoleSelect value={roles[0]} onChange={(role) => setRoles([role])} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || roles.length === 0}
          >
            {mutation.isPending ? 'Saving…' : 'Save access'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function AdministrationPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const users = useQuery({
    queryKey: ['profiles', profile?.id],
    queryFn: () => campaignService.listProfiles(),
    enabled: Boolean(profile),
  });
  const health = useQuery({
    queryKey: ['operations-health', profile?.id],
    queryFn: () => campaignService.getOperationsHealth(),
    enabled: Boolean(profile),
  });
  const processOutbox = useMutation({
    mutationFn: campaignService.processOutbox,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['operations-health'] });
      toast.success(
        `Worker completed. ${result.processed} event${result.processed === 1 ? '' : 's'} processed.`,
      );
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });
  const retryOutbox = useMutation({
    mutationFn: campaignService.retryOutboxEvent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['operations-health'] });
      toast.success('Outbox event returned to the pending queue.');
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });
  const testIntegration = useMutation({
    mutationFn: campaignService.testIntegration,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['operations-health'] });
      const notify = result.status === 'UNAVAILABLE' ? toast.error : toast.success;
      notify(`${result.provider}: ${result.message}`);
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });

  if (users.isLoading || health.isLoading) return <LoadingState label="Loading administration" />;
  if (users.error || health.error)
    return (
      <ErrorState
        message={getFriendlyError(users.error ?? health.error)}
        retry={() => {
          void users.refetch();
          void health.refetch();
        }}
      />
    );

  const healthData = health.data;
  if (!healthData) return null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administrator controls"
        title="Administration"
        description="Manage internal access, truthful integration modes, and operational delivery health."
        actions={
          <div className="flex flex-wrap gap-2">
            <CreateUserDialog onCreated={() => void users.refetch()} />
            <InviteUserDialog onInvited={() => void users.refetch()} />
          </div>
        }
      />
      <Tabs.Root defaultValue="users">
        <Tabs.List
          className="flex gap-1 border-b border-[var(--border)]"
          aria-label="Administration sections"
        >
          {[
            { value: 'users', label: 'Users', icon: Users },
            { value: 'integrations', label: 'Integrations', icon: Cable },
            { value: 'operations', label: 'Operations', icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <Tabs.Trigger
                key={tab.value}
                value={tab.value}
                className="flex min-h-11 items-center gap-2 border-b-2 border-transparent px-4 text-sm text-[var(--text-dim)] focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none data-[state=active]:border-[var(--acid)] data-[state=active]:text-[var(--text)]"
              >
                <Icon className="size-4" />
                {tab.label}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        <Tabs.Content value="users" className="mt-6 focus-visible:outline-none">
          <Card>
            <CardHeader
              title="Internal users"
              description="Create accounts directly with a temporary password, or send an invitation. Each person has one hierarchical role level."
            />
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Role</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.data?.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <p className="font-semibold text-[var(--text)]">{user.displayName}</p>
                        <p className="mt-1 text-xs text-[var(--text-dim)]">{user.email}</p>
                      </td>
                      <td>
                        <Badge
                          tone={
                            user.status === 'ACTIVE'
                              ? 'success'
                              : user.status === 'SUSPENDED'
                                ? 'danger'
                                : 'attention'
                          }
                        >
                          {user.status}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {user.roles.map((role) => (
                            <span
                              key={role}
                              className="rounded-md border border-[var(--border)] bg-white/4 px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]"
                            >
                              {roleLabel[role]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedUser(user)}>
                          <Settings2 className="size-3.5" />
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="integrations" className="mt-6 focus-visible:outline-none">
          <Card>
            <CardHeader
              title="Integration connections"
              description="Manual mode means the external action is completed outside this system and recorded honestly."
            />
            <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2 xl:grid-cols-4">
              {healthData.connections.map((connection) => (
                <article key={connection.id} className="bg-[var(--surface-raised)] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid size-10 place-items-center rounded-lg bg-white/5 text-[var(--acid-ink)]">
                      <Cable className="size-4" />
                    </div>
                    <Badge
                      tone={
                        connection.status === 'CONNECTED' || connection.status === 'MANUAL'
                          ? 'success'
                          : connection.status === 'DEGRADED'
                            ? 'attention'
                            : 'neutral'
                      }
                    >
                      {connection.status}
                    </Badge>
                  </div>
                  <h3 className="mt-5 text-sm font-semibold text-[var(--text)]">
                    {connection.provider}
                  </h3>
                  <p className="mt-2 text-xs text-[var(--text-dim)]">
                    Mode: {connection.mode.toLowerCase()}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-dim)]">
                    Tested: {formatDateTime(connection.lastTestedAt)}
                  </p>
                  <Button
                    className="mt-4"
                    variant="secondary"
                    size="sm"
                    disabled={testIntegration.isPending}
                    onClick={() => testIntegration.mutate(connection.provider)}
                  >
                    <Play className="size-3.5" />
                    {testIntegration.isPending && testIntegration.variables === connection.provider
                      ? 'Testing…'
                      : 'Test connection'}
                  </Button>
                </article>
              ))}
            </div>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="operations" className="mt-6 space-y-5 focus-visible:outline-none">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Pending outbox"
              value={healthData.pendingOutbox}
              detail="Waiting for a worker"
              icon={<RefreshCw className="size-5" />}
            />
            <MetricCard
              label="Failed events"
              value={healthData.failedOutbox}
              detail="Eligible for retry"
              icon={<CircleAlert className="size-5" />}
            />
            <MetricCard
              label="Dead letter"
              value={healthData.deadLetter}
              detail="Manual review required"
              icon={<Shield className="size-5" />}
            />
            <MetricCard
              label="Stuck workers"
              value={healthData.stuckProcessing}
              detail="Locks older than 15 minutes"
              icon={<CircleAlert className="size-5" />}
            />
            <MetricCard
              label="Integration failures"
              value={healthData.failedAttempts}
              detail="Sanitized attempt records"
              icon={<Activity className="size-5" />}
            />
          </div>
          <Card>
            <CardHeader
              title="Outbox worker"
              description="Processes a bounded batch using idempotency keys, exponential retry, and dead-letter limits."
              action={
                <Button
                  variant="secondary"
                  disabled={processOutbox.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Process the next bounded outbox batch now? External adapters may be invoked.',
                      )
                    )
                      processOutbox.mutate();
                  }}
                >
                  <Play className="size-3.5" />
                  {processOutbox.isPending ? 'Processing…' : 'Process pending batch'}
                </Button>
              }
            />
            <CardBody>
              <div className="flex items-start gap-3 rounded-lg border border-[var(--acid)]/15 bg-[var(--acid)]/5 p-4">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-[var(--acid-ink)]" />
                <p className="text-sm leading-6 text-[var(--text-muted)]">
                  The browser never reads outbox payloads. This control invokes the authenticated
                  server-side worker and returns only sanitized counts.
                </p>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Failed delivery jobs"
              description="Sanitized routing metadata only; payloads and secrets never reach the browser."
            />
            {healthData.failedJobs.length ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Attempts</th>
                      <th>Last error</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthData.failedJobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <p className="font-semibold text-[var(--text)]">{job.eventType}</p>
                          <p className="mt-1 text-xs text-[var(--text-dim)]">
                            {job.aggregateType} · {formatDateTime(job.createdAt)}
                          </p>
                        </td>
                        <td>
                          <Badge tone={job.status === 'DEAD_LETTER' ? 'danger' : 'attention'}>
                            {job.status.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td>{job.attemptCount}</td>
                        <td className="max-w-xs text-xs text-[var(--text-muted)]">
                          {job.errorCode ?? 'No sanitized error code'}
                        </td>
                        <td className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={retryOutbox.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Retry ${job.eventType}? This resets its attempt counter and returns it to the pending queue.`,
                                )
                              )
                                retryOutbox.mutate(job.id);
                            }}
                          >
                            <RefreshCw className="size-3.5" />
                            Retry
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <CardBody>
                <div className="flex items-start gap-3 rounded-lg border border-[var(--acid)]/15 bg-[var(--acid)]/5 p-4">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-[var(--acid-ink)]" />
                  <p className="text-sm text-[var(--text-muted)]">
                    No failed or dead-letter outbox jobs need attention.
                  </p>
                </div>
              </CardBody>
            )}
          </Card>
        </Tabs.Content>
      </Tabs.Root>
      <ManageUserDialog
        key={selectedUser?.id ?? 'none'}
        user={selectedUser}
        open={Boolean(selectedUser)}
        onOpenChange={(open) => !open && setSelectedUser(null)}
        onSaved={() => void users.refetch()}
      />
    </div>
  );
}
