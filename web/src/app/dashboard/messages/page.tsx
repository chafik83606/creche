import { DEMO_TENANT_ID } from '@/components/DashboardNav';
import { AnnouncementsPanel } from '@/components/AnnouncementsPanel';

export default function MessagesPage() {
  return <AnnouncementsPanel tenantId={DEMO_TENANT_ID} />;
}
