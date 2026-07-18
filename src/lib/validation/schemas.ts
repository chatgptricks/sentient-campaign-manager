import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string(),
});

export const passwordSetupSchema = z
  .object({
    password: z
      .string()
      .min(10, 'Use at least 10 characters.')
      .regex(/[A-Za-z]/, 'Include at least one letter.')
      .regex(/\d/, 'Include at least one number.'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export const clientSchema = z.object({
  name: z.string().trim().min(2, 'Client name is required.').max(120),
  billingEmail: z.union([z.literal(''), z.email('Enter a valid billing email.')]),
  billingAddress: z.string().trim().max(500),
});

export const promotionSchema = z.object({
  clientId: z.uuid('Choose a client.'),
  title: z.string().trim().min(3, 'Promotion title is required.').max(160),
  description: z.string().trim().max(2000),
  dueDate: z
    .string()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Choose a valid date.'),
  salesOwnerId: z.uuid('Choose a sales owner.'),
});

export const promotionEditSchema = promotionSchema.pick({
  title: true,
  description: true,
  dueDate: true,
});

export const resourceLinkSchema = z.object({
  provider: z.enum(['CANVA', 'GOOGLE_DRIVE', 'DROPBOX', 'OTHER']),
  resourceType: z.string().trim().min(2, 'Describe the resource type.').max(80),
  displayName: z.string().trim().min(2, 'Display name is required.').max(160),
  url: z
    .url('Enter a valid URL.')
    .refine((value) => value.startsWith('https://'), 'Only HTTPS links are allowed.'),
});

export const approvalDecisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REVISION_REQUESTED']),
    comments: z.string().trim().max(2000),
  })
  .superRefine((value, context) => {
    if (value.decision === 'REVISION_REQUESTED' && !value.comments) {
      context.addIssue({
        code: 'custom',
        path: ['comments'],
        message: 'Revision notes are required.',
      });
    }
  });

export const publicationSchema = z.object({
  provider: z.string().trim().min(2, 'Provider is required.').max(80),
  destination: z.string().trim().min(2, 'Destination is required.').max(120),
  publicationUrl: z
    .url('Enter a valid publication URL.')
    .refine((value) => value.startsWith('https://'), 'Only HTTPS links are allowed.'),
  externalPublicationId: z.string().trim().max(160),
  artifactResourceLinkId: z.uuid('Choose the approved artifact.'),
  publishedAt: z.string().min(1, 'Publication date is required.'),
});

export const verificationSchema = z.object({
  status: z.enum(['VERIFIED', 'FAILED', 'UNAVAILABLE']),
  notes: z.string().trim().max(1000),
});

export const invoiceSchema = z
  .object({
    amount: z.number().positive('Amount must be greater than zero.'),
    currency: z
      .string()
      .trim()
      .length(3, 'Use a three-letter ISO currency code.')
      .transform((value) => value.toUpperCase()),
    invoiceNumber: z.string().trim().max(80),
    status: z.enum(['DRAFT', 'ISSUED']),
  })
  .superRefine((value, context) => {
    if (value.status === 'ISSUED' && !value.invoiceNumber) {
      context.addIssue({
        code: 'custom',
        path: ['invoiceNumber'],
        message: 'An issued invoice requires an invoice number.',
      });
    }
  });

export const issueInvoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1, 'Invoice number is required.').max(80),
});

export const cancellationSchema = z.object({
  reason: z.string().trim().min(10, 'Add a clear cancellation reason.').max(1000),
});

export const assignmentSchema = z.object({
  userId: z.uuid('Choose a team member.'),
});

export const inviteUserSchema = z.object({
  displayName: z.string().trim().min(2, 'Display name is required.').max(120),
  email: z.email('Enter a valid email address.'),
  roles: z
    .array(z.enum(['SALES', 'CREATOR', 'APPROVER', 'PUBLISHER', 'FINANCE', 'ADMINISTRATOR']))
    .min(1, 'Choose at least one role.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordSetupInput = z.infer<typeof passwordSetupSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type PromotionInput = z.infer<typeof promotionSchema>;
export type PromotionEditInput = z.infer<typeof promotionEditSchema>;
export type ResourceLinkInput = z.infer<typeof resourceLinkSchema>;
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
export type PublicationInput = z.infer<typeof publicationSchema>;
export type VerificationInput = z.infer<typeof verificationSchema>;
export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type IssueInvoiceInput = z.infer<typeof issueInvoiceSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
