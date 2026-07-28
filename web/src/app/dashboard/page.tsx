import { DEMO_TENANT_ID, DEMO_CHILD_ID, DEMO_CHILD_NAME } from '@/components/DashboardNav';
import { DailyLogViewer } from '@/components/DailyLogViewer';

export default function DashboardPage() {
  return (
    <DailyLogViewer
      tenantId={DEMO_TENANT_ID}
      childId={DEMO_CHILD_ID}
      childName={DEMO_CHILD_NAME}
    />
  );
}
