import React from 'react';
import Header from '@/components/layout/Header';
import { EmailCampaignBuilder } from '@/components/campaigns/EmailCampaignBuilder';

export default function EmailCampaignBuilderPage() {
  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-6">
          <EmailCampaignBuilder />
        </div>
      </div>
    </div>
  );
}
