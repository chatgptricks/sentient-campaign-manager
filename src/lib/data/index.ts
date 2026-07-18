import { publicConfig } from '../supabase/config';
import { demoCampaignService } from './demo-service';
import { supabaseCampaignService } from './supabase-service';

export const campaignService = publicConfig.demoMode
  ? demoCampaignService
  : supabaseCampaignService;

export type { CampaignService } from './service';
