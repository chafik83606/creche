import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { colors, radius, shadow, spacing } from '../lib/theme';
import { ScreenHeader } from './ui/ScreenHeader';

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

type TabIcon = keyof typeof Ionicons.glyphMap;

function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: TabIcon;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? colors.primary : colors.textMuted}
      />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function roleLabel(role: UserRole | null | undefined) {
  switch (role) {
    case 'parent':
      return 'Parent';
    case 'educator':
      return 'Educateur';
    case 'director':
      return 'Directeur';
    case 'network_admin':
      return 'Admin reseau';
    default:
      return null;
  }
}

function displayInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
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
        <ActivityIndicator color={colors.primary} />
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
        <TabButton icon="book-outline" label="Carnet" active={tab === 'carnet'} onPress={() => setTab('carnet')} />
        <TabButton icon="megaphone-outline" label="Annonces" active={tab === 'annonces'} onPress={() => setTab('annonces')} />
        <TabButton icon="chatbubble-outline" label="Messages" active={tab === 'messages'} onPress={() => setTab('messages')} />
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
        <ActivityIndicator color={colors.primary} />
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
        <TabButton icon="book-outline" label="Carnet" active={tab === 'carnet'} onPress={() => setTab('carnet')} />
        <TabButton icon="megaphone-outline" label="Annonces" active={tab === 'annonces'} onPress={() => setTab('annonces')} />
        <TabButton icon="chatbubble-outline" label="Messages" active={tab === 'messages'} onPress={() => setTab('messages')} />
        <TabButton icon="shield-checkmark-outline" label="Consent." active={tab === 'consentements'} onPress={() => setTab('consentements')} />
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
    return <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <View style={styles.flex}>
      <View style={styles.tabBar}>
        <TabButton icon="megaphone-outline" label="Annonces" active={tab === 'annonces'} onPress={() => setTab('annonces')} />
        <TabButton icon="book-outline" label="Carnet" active={tab === 'carnet'} onPress={() => setTab('carnet')} />
        <TabButton icon="chatbubble-outline" label="Messages" active={tab === 'messages'} onPress={() => setTab('messages')} />
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

  const greetingName = user?.displayName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'vous';
  const subtitle = roleLabel(role);

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title="Zibou"
        subtitle={subtitle ?? undefined}
        onLogout={() => signOut(auth)}
      />
      <View style={styles.welcomeCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {displayInitials(user?.displayName, user?.email)}
          </Text>
        </View>
        <View style={styles.welcomeTextBlock}>
          <Text style={styles.welcomeTitle}>Bonjour, {greetingName}</Text>
          <Text style={styles.welcomeSubtitle}>
            {role === 'parent'
              ? 'Suivez la journee de votre enfant'
              : role === 'educator'
                ? 'Saisissez le suivi quotidien'
                : 'Gerez votre etablissement'}
          </Text>
        </View>
      </View>

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
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  welcomeTextBlock: { flex: 1 },
  welcomeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  welcomeSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  childPicker: {
    maxHeight: 56,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  childPickerContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  childChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  childChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryMuted,
  },
  childChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  childChipTextActive: { color: colors.primary, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.md,
    gap: 4,
  },
  tabActive: { backgroundColor: colors.primaryLight },
  tabText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
  noRole: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  noRoleText: { textAlign: 'center', color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
});
