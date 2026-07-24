import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createPromotion = vi.hoisted(() => vi.fn());
const listClients = vi.hoisted(() => vi.fn());
const syncPromotionChannelSheet = vi.hoisted(() => vi.fn());

vi.mock('../../lib/data', () => ({
  campaignService: { createPromotion, listClients, syncPromotionChannelSheet },
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ profile: { id: 'user-1', displayName: 'Sales', roles: ['SALES'] } }),
}));

vi.mock('../clients/ClientFormDialog', () => ({
  ClientFormDialog: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

import { CreatePromotionPage } from './CreatePromotionPage';

// The promotion schema validates these as UUIDs, so the fixtures must be real ones.
const CLIENT_ID = '10000000-0000-4000-8000-000000000001';
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/sheet-id/edit#gid=0';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CreatePromotionPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function fillRequiredDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Client'), CLIENT_ID);
  await user.type(screen.getByLabelText('Promotion name'), 'Summer rooftop launch');
}

describe('create promotion steps', () => {
  beforeEach(() => {
    createPromotion.mockReset();
    createPromotion.mockResolvedValue({ id: 'promotion-1' });
    listClients.mockReset();
    listClients.mockResolvedValue([
      { id: CLIENT_ID, name: 'Arcadia Hotels', billingEmail: null, billingAddress: null },
    ]);
    syncPromotionChannelSheet.mockReset();
    syncPromotionChannelSheet.mockResolvedValue([]);
  });

  it('opens on the details step without showing Sheet setup', async () => {
    renderPage();

    expect(await screen.findByLabelText('Promotion name')).toBeVisible();
    expect(screen.queryByLabelText('Google Sheet link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Create promotion/ })).not.toBeInTheDocument();
  });

  it('stays on the details step when required fields are missing', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText('Promotion name');
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    expect(await screen.findByText('Choose a client.')).toBeVisible();
    expect(screen.queryByLabelText('Google Sheet link')).not.toBeInTheDocument();
    expect(createPromotion).not.toHaveBeenCalled();
  });

  it('advances to Sheet setup once the details are valid', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText('Promotion name');
    await fillRequiredDetails(user);
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    expect(await screen.findByLabelText('Google Sheet link')).toBeVisible();
    expect(screen.queryByLabelText('Promotion name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create promotion/ })).toBeVisible();
  });

  it('keeps entered details when stepping back', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText('Promotion name');
    await fillRequiredDetails(user);
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await screen.findByLabelText('Google Sheet link');
    await user.click(screen.getByRole('button', { name: /Back to details/ }));

    expect(await screen.findByLabelText('Promotion name')).toHaveValue('Summer rooftop launch');
    expect(screen.getByLabelText('Client')).toHaveValue(CLIENT_ID);
  });

  it('requires a Google Sheet link before creating the promotion', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText('Promotion name');
    await fillRequiredDetails(user);
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.click(screen.getByRole('button', { name: /Create promotion/ }));

    expect(await screen.findByText('Paste the Google Sheet link.')).toBeVisible();
    expect(createPromotion).not.toHaveBeenCalled();
  });

  it('submits the promotion and syncs the Google Sheet from step two', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText('Promotion name');
    await fillRequiredDetails(user);
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.type(await screen.findByLabelText('Google Sheet link'), SHEET_URL);
    await user.click(screen.getByRole('button', { name: /Create promotion/ }));

    await waitFor(() => expect(createPromotion).toHaveBeenCalledOnce());
    const payload = createPromotion.mock.calls[0]![0];
    expect(payload).toMatchObject({
      clientId: CLIENT_ID,
      title: 'Summer rooftop launch',
    });
    expect(payload.metadata.publishingSheetUrl).toBe(SHEET_URL);
    expect(payload.metadata.publishingAccountIds).toEqual([]);
    await waitFor(() =>
      expect(syncPromotionChannelSheet).toHaveBeenCalledWith('promotion-1', SHEET_URL),
    );
  });
});
