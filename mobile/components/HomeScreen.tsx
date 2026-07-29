import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { DailyTrackingScreen } from './DailyTrackingScreen';
import { AnnouncementsScreen } from './AnnouncementsScreen';
import { ConsentScreen } from './ConsentScreen';
import { ConsentManageScreen } from './ConsentManageScreen';
import { PrivateChatScreen } from './PrivateChatScreen';
import { AdminScreen } from './AdminScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { registerForPushNotifications, addNotificationListeners } from '../lib/notifications';
import { paths } from '@creche/shared';
import type { UserRole } from '@creche/shared';
import { isConsentActive, loadConsent } from '../lib/consents';

const FALLBACK_TENANT_ID = 'demo-creche';
const FALLBACK_CHILD_ID = 'demo-child-001';
const FALLBACK_EDUCATOR = { id: 'demo-educator-001', name: 'Marie Dupont' };
const FALLBACK_PARENT = { id: 'demo-parent-001', name: 'Sophie Martin' };

type Tab = 'carnet' | 'annonces' | 'messages' | 'consentements';

type ChildSummary = {
  id: string;
  firstName: string;
  lastName: string;
  groupId?: string;
  parentIds?: string[];
};

type ChatPeer = { id: string; name: string };

function childDisplayName(child: ChildSummary) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function ChildPicker({
  items,
  selectedId,
  onSelect,
}: {
  items: ChildSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (items.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.childPicker}
      contentContainerStyle={styles.childPickerContent}
    >
      {items.map((child) => {
        const active = child.id === selectedId;
        return (
          <TouchableOpacity
            key={child.id}
            style={[styles.childChip, active && styles.childChipActive]}
            onPress={() => onSelect(child.id)}
          >
            <Text style={[styles.childChipText, active && styles.childChipTextActive]}>
              {child.firstName}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

async function fetchChildrenByIds(
  tenantId: string,
  childIds: string[]
): Promise<ChildSummary[]> {
  const results = await Promise.all(
    childIds.map(async (id) => {
      const snap = await getDoc(doc(db, paths.child(tenantId, id)));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        id: snap.id,
        firstName: data.firstName ?? 'Enfant',
        lastName: data.lastName ?? '',
        groupId: data.groupId,
        parentIds: data.parentIds ?? [],
      } as ChildSummary;
    })
  );
  return results.filter((c): c is ChildSummary => c != null);
}

async function fetchChildrenForGroups(
  tenantId: string,
  groupIds: string[]
): Promise<ChildSummary[]> {
  if (groupIds.length === 0) return [];
  const q = query(
    collection(db, paths.children(tenantId)),
    where('groupId', 'in', groupIds.slice(0, 10))
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      firstName: data.firstName ?? 'Enfant',
      lastName: data.lastName ?? '',
      groupId: data.groupId,
      parentIds: data.parentIds ?? [],
    } as ChildSummary;
  });
}

async function resolveEducatorPeer(
  tenantId: string,
  child: ChildSummary | undefined
): Promise<ChatPeer> {
  if (!child?.groupId) return FALLBACK_EDUCATOR;
  const groupSnap = await getDoc(doc(db, paths.group(tenantId, child.groupId)));
  const educatorId = groupSnap.data()?.educatorIds?.[0] as string | undefined;
  if (!educatorId) return FALLBACK_EDUCATOR;
  const memberSnap = await getDoc(doc(db, paths.member(tenantId, educatorId)));
  return {
    id: educatorId,
    name: memberSnap.data()?.displayName ?? FALLBACK_EDUCATOR.name,
  };
}

async function resolveParentPeer(
  tenantId: string,
  child: ChildSummary | undefined
): Promise<ChatPeer> {
  const parentId = child?.parentIds?.[0];
  if (!parentId) return FALLBACK_PARENT;
  const memberSnap = await getDoc(doc(db, paths.member(tenantId, parentId)));
  return {
    id: parentId,
    name: memberSnap.data()?.displayName ?? FALLBACK_PARENT.name,
  };
}

function EducatorHome({
  tenantId,
  groupIds,
}: {
  tenantId: string;
  groupIds: string[];
}) {
  const [tab, setTab] = useState<Tab>('carnet');
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [chatPeer, setChatPeer] = useState<ChatPeer>(FALLBACK_PARENT);
  const [groupName, setGroupName] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const primaryGroupId = groupIds[0];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await fetchChildrenForGroups(tenantId, groupIds);
      const resolved =
        list.length > 0
          ? list
          : await fetchChildrenByIds(tenantId, [FALLBACK_CHILD_ID]);

      let name: string | undefined;
      if (primaryGroupId) {
        const groupSnap = await getDoc(doc(db, paths.group(tenantId, primaryGroupId)));
        name = groupSnap.data()?.name;
      }

      if (cancelled) return;
      setChildren(resolved);
      setSelectedChildId(resolved[0]?.id ?? FALLBACK_CHILD_ID);
      setGroupName(name);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, groupIds.join('|'), primaryGroupId]);

  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedChildId) ?? children[0],
    [children, selectedChildId]
  );

  useEffect(() => {
    if (!selectedChild) return;
    resolveParentPeer(tenantId, selectedChild).then(setChatPeer);
  }, [tenantId, selectedChild?.id]);

  if (loading || !selectedChild) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#4a90d9" />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ChildPicker
        items={children}
        selectedId={selectedChild.id}
        onSelect={setSelectedChildId}
      />
      <View style={styles.tabBar}>
        <TabButton label="Carnet" active={tab === 'carnet'} onPress={() => setTab('carnet')} />
        <TabButton label="Annonces" active={tab === 'annonces'} onPress={() => setTab('annonces')} />
        <TabButton label="Messages" active={tab === 'messages'} onPress={() => setTab('messages')} />
      </View>
      {tab === 'carnet' && (
        <DailyTrackingScreen
          tenantId={tenantId}
          childId={selectedChild.id}
          childName={childDisplayName(selectedChild)}
        />
      )}
      {tab === 'annonces' && (
        <AnnouncementsScreen
          tenantId={tenantId}
          canSend
          groupId={primaryGroupId}
          groupName={groupName}
        />
      )}
      {tab === 'messages' && (
        <PrivateChatScreen
          tenantId={tenantId}
          childId={selectedChild.id}
          recipientId={chatPeer.id}
          recipientName={chatPeer.name}
        />
      )}
    </View>
  );
}

function ParentHome({
  tenantId,
  childIds,
}: {
  tenantId: string;
  childIds: string[];
}) {
  const [tab, setTab] = useState<Tab>('carnet');
  const [consentDone, setConsentDone] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [chatPeer, setChatPeer] = useState<ChatPeer>(FALLBACK_EDUCATOR);
  const [loading, setLoading] = useState(true);

  const ids = childIds.length > 0 ? childIds : [FALLBACK_CHILD_ID];
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await fetchChildrenByIds(tenantId, ids);
      if (cancelled) return;
      setChildren(list);
      setSelectedChildId((prev) => prev || list[0]?.id || FALLBACK_CHILD_ID);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, ids.join('|')]);

  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedChildId) ?? children[0],
    [children, selectedChildId]
  );

  useEffect(() => {
    if (!selectedChild) return;
    resolveEducatorPeer(tenantId, selectedChild).then(setChatPeer);
  }, [tenantId, selectedChild?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uid || !selectedChild) {
        setConsentChecked(true);
        return;
      }
      setConsentChecked(false);
      try {
        const gdpr = await loadConsent(tenantId, uid, selectedChild.id, 'gdpr_data');
        if (!cancelled) {
          setConsentDone(isConsentActive(gdpr));
        }
      } finally {
        if (!cancelled) setConsentChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, uid, selectedChild?.id]);

  if (loading || !consentChecked) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#4a90d9" />
      </View>
    );
  }

  if (!consentDone) {
    return (
      <ConsentScreen
        tenantId={tenantId}
        childId={selectedChild?.id ?? ids[0]}
        onComplete={() => setConsentDone(true)}
      />
    );
  }

  if (!selectedChild) {
    return (
      <View style={styles.centered}>
        <Text style={styles.noRoleText}>Aucun enfant associe a ce compte.</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ChildPicker
        items={children}
        selectedId={selectedChild.id}
        onSelect={setSelectedChildId}
      />
      <View style={styles.tabBar}>
        <TabButton label="Carnet" active={tab === 'carnet'} onPress={() => setTab('carnet')} />
        <TabButton label="Annonces" active={tab === 'annonces'} onPress={() => setTab('annonces')} />
        <TabButton label="Messages" active={tab === 'messages'} onPress={() => setTab('messages')} />
        <TabButton label="Consent." active={tab === 'consentements'} onPress={() => setTab('consentements')} />
      </View>
      {tab === 'carnet' && (
        <DailyTrackingScreen
          tenantId={tenantId}
          childId={selectedChild.id}
          childName={childDisplayName(selectedChild)}
          readOnly
        />
      )}
      {tab === 'annonces' && <AnnouncementsScreen tenantId={tenantId} />}
      {tab === 'messages' && (
        <PrivateChatScreen
          tenantId={tenantId}
          childId={selectedChild.id}
          recipientId={chatPeer.id}
          recipientName={chatPeer.name}
        />
      )}
      {tab === 'consentements' && (
        <ConsentManageScreen
          tenantId={tenantId}
          childId={selectedChild.id}
          childName={childDisplayName(selectedChild)}
          onGdprRevoked={() => {
            setConsentDone(false);
            setTab('carnet');
          }}
        />
      )}
    </View>
  );
}

function DirectorHome({ tenantId }: { tenantId: string }) {
  type DirTab = 'annonces' | 'carnet' | 'messages';
  const [tab, setTab] = useState<DirTab>('annonces');
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [membersList, setMembersList] = useState<{ uid: string; displayName: string }[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [dirLoading, setDirLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDirLoading(true);
      const childrenSnap = await getDocs(
        query(collection(db, paths.children(tenantId)), where('enrollmentStatus', '==', 'active'))
      );
      const cList = childrenSnap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, firstName: data.firstName ?? '', lastName: data.lastName ?? '', groupId: data.groupId, parentIds: data.parentIds ?? [] } as ChildSummary;
      });
      const membersSnap = await getDocs(collection(db, paths.members(tenantId)));
      const mList = membersSnap.docs
        .map((d) => ({ uid: d.id, displayName: d.data().displayName ?? d.data().email ?? d.id }))
        .filter((m) => m.uid !== auth.currentUser?.uid);
      if (cancelled) return;
      setChildren(cList);
      setSelectedChildId(cList[0]?.id ?? '');
      setMembersList(mList);
      setSelectedMemberId(mList[0]?.uid ?? '');
      setDirLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedChildId),
    [children, selectedChildId]
  );
  const selectedMember = useMemo(
    () => membersList.find((m) => m.uid === selectedMemberId),
    [membersList, selectedMemberId]
  );

  if (dirLoading) {
    return <View style={styles.centered}><ActivityIndicator color="#4a90d9" /></View>;
  }

  return (
    <View style={styles.flex}>
      <View style={styles.tabBar}>
        <TabButton label="Annonces" active={tab === 'annonces'} onPress={() => setTab('annonces')} />
        <TabButton label="Carnet" active={tab === 'carnet'} onPress={() => setTab('carnet')} />
        <TabButton label="Messages" active={tab === 'messages'} onPress={() => setTab('messages')} />
      </View>

      {tab === 'annonces' && <AnnouncementsScreen tenantId={tenantId} canSend />}

      {tab === 'carnet' && (
        <View style={styles.flex}>
          <ChildPicker items={children} selectedId={selectedChildId} onSelect={setSelectedChildId} />
          {selectedChild ? (
            <DailyTrackingScreen tenantId={tenantId} childId={selectedChild.id} childName={childDisplayName(selectedChild)} readOnly />
          ) : (
            <View style={styles.centered}><Text style={styles.noRoleText}>Aucun enfant inscrit.</Text></View>
          )}
        </View>
      )}

      {tab === 'messages' && (
        <View style={styles.flex}>
          {membersList.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childPicker} contentContainerStyle={styles.childPickerContent}>
              {membersList.map((m) => (
                <TouchableOpacity key={m.uid} style={[styles.childChip, m.uid === selectedMemberId && styles.childChipActive]} onPress={() => setSelectedMemberId(m.uid)}>
                  <Text style={[styles.childChipText, m.uid === selectedMemberId && styles.childChipTextActive]}>{m.displayName.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {selectedMember ? (
            <PrivateChatScreen tenantId={tenantId} childId={selectedChildId || 'general'} recipientId={selectedMember.uid} recipientName={selectedMember.displayName} />
          ) : (
            <View style={styles.centered}><Text style={styles.noRoleText}>Aucun membre dans la creche.</Text></View>
          )}
        </View>
      )}
    </View>
  );
}

export function HomeScreen() {
  const { role, user, claims } = useAuth();
  const insets = useSafeAreaInsets();

  const tenantIds = claims?.tenantIds?.length ? claims.tenantIds : [FALLBACK_TENANT_ID];
  const [activeTenantId, setActiveTenantId] = useState(tenantIds[0]);
  const childIds = claims?.childIds ?? [];
  const groupIds = claims?.groupIds ?? [];

  useEffect(() => {
    if (!tenantIds.includes(activeTenantId)) {
      setActiveTenantId(tenantIds[tenantIds.length - 1] ?? FALLBACK_TENANT_ID);
    }
  }, [tenantIds.join('|'), activeTenantId]);

  const tenantId = activeTenantId;

  useEffect(() => {
    if (!user) return;

    registerForPushNotifications(tenantId).catch((err) => {
      console.warn('Enregistrement push echoue:', err);
    });

    return addNotificationListeners();
  }, [user, tenantId]);

  return (
    <View style={styles.flex}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 12 }]}>
        <Text style={styles.headerTitle}>Zibou</Text>
        <TouchableOpacity onPress={() => signOut(auth)}>
          <Text style={styles.logout}>Deconnexion</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.welcome}>
        Bonjour {user?.displayName ?? user?.email}
      </Text>

      {role === 'educator' && (
        <EducatorHome tenantId={tenantId} groupIds={groupIds} />
      )}
      {role === 'parent' && (
        <ParentHome tenantId={tenantId} childIds={childIds} />
      )}
      {role === 'network_admin' && (
        <AdminScreen
          tenantId={tenantId}
          tenantIds={tenantIds}
          onTenantChange={setActiveTenantId}
        />
      )}
      {role === 'director' && <DirectorHome tenantId={tenantId} />}
      {!role && <OnboardingScreen onDone={() => {}} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8f9fa' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#4a90d9',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  logout: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  welcome: { padding: 16, fontSize: 15, color: '#444', backgroundColor: '#fff' },
  childPicker: {
    maxHeight: 52,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  childPickerContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  childChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  childChipActive: { backgroundColor: '#4a90d9' },
  childChipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  childChipTextActive: { color: '#fff', fontWeight: '600' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#4a90d9' },
  tabText: { fontSize: 14, color: '#888' },
  tabTextActive: { color: '#4a90d9', fontWeight: '600' },
  noRole: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  noRoleText: { textAlign: 'center', color: '#666', fontSize: 15, lineHeight: 22 },
});
