import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateUser = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase/config', () => ({
  isSupabaseConfigured: false,
  publicConfig: {
    basePath: '/sentient-campaign-manager/',
    supabasePublishableKey: '',
    supabaseUrl: '',
  },
}));

vi.mock('../../lib/supabase/client', () => ({
  supabase: { auth: { signOut, updateUser } },
}));

import { AuthProvider, useAuth } from './AuthProvider';

function PasswordUpdateHarness() {
  const { credentialSetup, signOut: signOutUser, updatePassword } = useAuth();
  return (
    <>
      <span data-testid="credential-setup">{credentialSetup ?? 'none'}</span>
      <button type="button" onClick={() => void updatePassword('Sentient1234')}>
        Save password
      </button>
      <button type="button" onClick={() => void signOutUser()}>
        Cancel setup
      </button>
    </>
  );
}

describe('AuthProvider recovery callback cleanup', () => {
  beforeEach(() => {
    updateUser.mockReset();
    updateUser.mockResolvedValue({ error: null });
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
    window.history.replaceState({}, '', '/sentient-campaign-manager/?auth=recovery#type=recovery');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('removes the recovery marker before leaving password setup', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PasswordUpdateHarness />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('credential-setup')).toHaveTextContent('recovery');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    await waitFor(() => expect(screen.getByTestId('credential-setup')).toHaveTextContent('none'));
    expect(updateUser).toHaveBeenCalledWith({
      password: 'Sentient1234',
      data: { must_change_password: false },
    });
    expect(window.location.pathname).toBe('/sentient-campaign-manager/');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/dashboard');
  });

  it('also removes the callback marker when setup is cancelled', async () => {
    const queryClient = new QueryClient();
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PasswordUpdateHarness />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel setup' }));

    await waitFor(() => expect(screen.getByTestId('credential-setup')).toHaveTextContent('none'));
    expect(signOut).toHaveBeenCalledOnce();
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/dashboard');
  });
});
