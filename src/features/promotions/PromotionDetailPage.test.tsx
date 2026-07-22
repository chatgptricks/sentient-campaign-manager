import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ApprovalSubmission, PromotionDetail, ResourceLink } from '../../domain/models';
import { CreativeSection, ResourceAccessControl } from './PromotionDetailPage';
import { getApprovedPublicationResources, getReferenceMaterial } from './presentation-helpers';

const baseResource: ResourceLink = {
  id: '60000000-0000-4000-8000-000000000001',
  promotionId: '20000000-0000-4000-8000-000000000001',
  provider: 'CANVA',
  resourceType: 'SOCIAL_CREATIVE',
  url: 'https://www.canva.com/design/example',
  storagePath: null,
  displayName: 'Promotion creative',
  validationStatus: 'VALID',
  validationMessage: null,
  attachedByName: 'Creator',
  attachedAt: '2026-07-18T12:00:00.000Z',
  archivedAt: null,
};

describe('resource access control', () => {
  it('renders an external resource as an HTTPS link', () => {
    render(
      <ResourceAccessControl resource={baseResource} opening={false} onOpenPrivate={vi.fn()} />,
    );

    expect(screen.getByRole('link', { name: /external link/i })).toHaveAttribute(
      'href',
      baseResource.url,
    );
  });

  it('never renders a private storage path as an external link', () => {
    const onOpenPrivate = vi.fn();
    const privateResource: ResourceLink = {
      ...baseResource,
      provider: 'SUPABASE_STORAGE',
      url: `${baseResource.promotionId}/${baseResource.id}/campaign.png`,
      storagePath: `${baseResource.promotionId}/${baseResource.id}/campaign.png`,
    };
    render(
      <ResourceAccessControl
        resource={privateResource}
        opening={false}
        onOpenPrivate={onOpenPrivate}
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /open private asset/i }));
    expect(onOpenPrivate).toHaveBeenCalledWith(privateResource.id, privateResource.storagePath);
  });
});

describe('publication resource eligibility', () => {
  const approvedSubmission: ApprovalSubmission = {
    id: '70000000-0000-4000-8000-000000000001',
    promotionId: baseResource.promotionId,
    submissionNumber: 1,
    resourceLinkId: baseResource.id,
    resourceName: baseResource.displayName,
    submittedBy: '00000000-0000-4000-8000-000000000003',
    submittedByName: 'Creator',
    submittedAt: '2026-07-18T12:00:00.000Z',
    state: 'APPROVED',
    decisionComments: null,
    decidedByName: 'Approver',
    decidedAt: '2026-07-18T13:00:00.000Z',
  };

  it('returns only approved, active resources', () => {
    const unapproved = { ...baseResource, id: '60000000-0000-4000-8000-000000000002' };
    const archived = {
      ...baseResource,
      id: '60000000-0000-4000-8000-000000000003',
      archivedAt: '2026-07-18T14:00:00.000Z',
    };
    const eligible = getApprovedPublicationResources({
      resources: [baseResource, unapproved, archived],
      submissions: [
        approvedSubmission,
        {
          ...approvedSubmission,
          id: '70000000-0000-4000-8000-000000000002',
          resourceLinkId: archived.id,
        },
      ],
    });

    expect(eligible).toEqual([baseResource]);
  });
});

describe('reference material', () => {
  const metadata: PromotionDetail['metadata'] = {
    promotionId: baseResource.promotionId,
    campaignType: 'Social promotion',
    scheduledDate: null,
    priority: 'NORMAL',
    briefUrl: 'https://docs.google.com/brief',
    clientMaterialLinks: ['https://drive.google.com/logo-pack'],
    externalResourceLinks: ['https://example.com/reference'],
    platforms: ['INSTAGRAM'],
    publishingAccountIds: [],
    externalPartnerAccountIds: [],
    internalNotes: null,
  };

  it('groups the brief, client material, and supporting links', () => {
    expect(getReferenceMaterial(metadata)).toEqual([
      { group: 'Brief', url: 'https://docs.google.com/brief' },
      { group: 'Client material', url: 'https://drive.google.com/logo-pack' },
      { group: 'Supporting link', url: 'https://example.com/reference' },
    ]);
  });

  it('omits a missing brief instead of rendering an empty entry', () => {
    expect(getReferenceMaterial({ ...metadata, briefUrl: null })).toEqual([
      { group: 'Client material', url: 'https://drive.google.com/logo-pack' },
      { group: 'Supporting link', url: 'https://example.com/reference' },
    ]);
  });

  it('never treats an attached creative file as reference material', () => {
    expect(getReferenceMaterial(null)).toEqual([]);
    expect(
      getReferenceMaterial({
        ...metadata,
        briefUrl: null,
        clientMaterialLinks: [],
        externalResourceLinks: [],
      }),
    ).toEqual([]);
  });
});

describe('creative production actions', () => {
  it('shows a primary creative link action when the creator can attach resources', () => {
    const onAdd = vi.fn();
    const detail: PromotionDetail = {
      promotion: {
        id: '20000000-0000-4000-8000-000000000001',
        clientId: '10000000-0000-4000-8000-000000000001',
        clientName: 'Client',
        title: 'Promotion',
        description: null,
        status: 'CREATIVE_IN_PROGRESS',
        salesOwnerId: '30000000-0000-4000-8000-000000000001',
        salesOwnerName: 'Sales',
        creatorId: '30000000-0000-4000-8000-000000000002',
        creatorName: 'Creator',
        approverId: null,
        approverName: null,
        dueDate: null,
        version: 3,
        createdAt: '2026-07-18T12:00:00.000Z',
        updatedAt: '2026-07-18T12:00:00.000Z',
        cancellationReason: null,
        allowedActions: ['ATTACH_RESOURCE'],
      },
      metadata: null,
      resources: [],
      submissions: [],
      publications: [],
      invoice: null,
      activity: [],
    };

    render(<CreativeSection detail={detail} onAdd={onAdd} onStart={vi.fn()} onSubmit={vi.fn()} />);

    const attachButtons = screen.getAllByRole('button', { name: /attach creative link/i });
    expect(attachButtons).toHaveLength(2);
    fireEvent.click(attachButtons[0]!);
    expect(onAdd).toHaveBeenCalledOnce();
    expect(screen.getByText(/Attach the finished creative link/i)).toBeVisible();
  });
});
