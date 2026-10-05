import React from 'react';
import Header from '@/components/layout/Header';
import { CallLogsDashboard } from '@/components/call-logs/CallLogsDashboard';

export default function CallLogsPage() {
  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-6">
          <CallLogsDashboard />
        </div>
      </div>
    </div>
  );
}
