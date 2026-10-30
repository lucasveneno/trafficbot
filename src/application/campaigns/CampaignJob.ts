import type { CampaignView } from '../../domain/control/ControlContract';
import type { TrafficJobData } from '../../domain/entities/SessionContract';
export function campaignJob(campaign: CampaignView, sequence: number): TrafficJobData {
  const targets = campaign.targets?.length ? campaign.targets : [campaign.url];
  return {
    url: targets[sequence % targets.length], durationMinutes: campaign.durationMinutes,
    intensity: campaign.intensity, behaviorModel: campaign.behaviorModel || 'generic', persistent: campaign.persistent,
    profileKey: campaign.profileKey, requirements: campaign.requirements, campaignId: campaign.id,
    campaignConcurrency: campaign.concurrency || 1, proxyMode: campaign.proxyMode,
    proxyIds: campaign.proxyMode === 'pool' ? campaign.proxyIds : undefined,
    proxy: campaign.proxy && (!campaign.proxyMode || campaign.proxyMode === 'auto') ? { host: `${campaign.proxy.protocol}://${campaign.proxy.host}`, port: campaign.proxy.port } : undefined,
  };
}
