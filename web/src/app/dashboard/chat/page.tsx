import { DEMO_TENANT_ID, DEMO_CHILD_ID } from '@/components/DashboardNav';
import { PrivateChatPanel } from '@/components/PrivateChatPanel';

const DEMO_EDUCATOR_ID = 'demo-educator-001';
const DEMO_EDUCATOR_NAME = 'Marie Dupont';

export default function ChatPage() {
  return (
    <PrivateChatPanel
      tenantId={DEMO_TENANT_ID}
      childId={DEMO_CHILD_ID}
      recipientId={DEMO_EDUCATOR_ID}
      recipientName={DEMO_EDUCATOR_NAME}
    />
  );
}
