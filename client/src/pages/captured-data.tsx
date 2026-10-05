import React from 'react';
import Header from '@/components/layout/Header';
import { CapturedDataDashboard } from '@/components/captured-data/CapturedDataDashboard';

export default function CapturedDataPage() {
  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="flex w-full flex-col p-4 sm:p-6">
            <CapturedDataDashboard />
          </div>
        </div>
      </div>
    </div>
  );
}

