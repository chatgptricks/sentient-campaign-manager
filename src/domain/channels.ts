export const publishingChannels = ['INSTAGRAM', 'X', 'LINKEDIN'] as const;

export type PublishingChannel = (typeof publishingChannels)[number];

export const publishingChannelLabel: Record<PublishingChannel, string> = {
  INSTAGRAM: 'Instagram',
  X: 'X',
  LINKEDIN: 'LinkedIn',
};

export function isPublishingChannel(value: string): value is PublishingChannel {
  return publishingChannels.includes(value as PublishingChannel);
}
