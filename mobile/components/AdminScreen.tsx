import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { collection, doc, getDoc, getDocs, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';
import { getCallableErrorMessage } from '../lib/callable-error';
import { paths, ROLES } from '@creche/shared';
import type { Child, Group, Tenant, TenantMember, UserRole } from '@creche/shared';
import { AnnouncementsScreen } from './AnnouncementsScreen';

type AdminTab = 'overview' | 'members' | 'invitations' | 'children' | 'groups' | 'annonces';

const ASSIGNABLE_ROLES: UserRole[] = ['parent', 'educator', 'director'];

type Invitation = {
  id: string;
  email: string;
  role: UserRole;
  inviteCode: string;
  childId?: string | null;
  groupIds?: string[];
  usedAt?: unknown;
};

interface Props {
  tenantId: string;
  tenantIds: string[];
  onTenantChange: (tenantId: string) => void;
}

type TenantSummary = { id: string; name: string };

function roleLabel(role: UserRole) {
  return ROLES[role]?.label ?? role;
}

export function AdminScreen({ tenantId, tenantIds, onTenantChange }: Props) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [allTenants, setAllTenants] = useState<TenantSummary[]>([]);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateTenantModal, setShowCreateTenantModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showCreateChildModal, setShowCreateChildModal] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [newChildFirstName, setNewChildFirstName] = useState('');
  const [newChildLastName, setNewChildLastName] = useState('');
  const [newChildGroupId, setNewChildGroupId] = useState('');
  const [newChildDob, setNewChildDob] = useState('2023-06-15');

  const [assignEmail, setAssignEmail] = useState('');
  const [assignRole, setAssignRole] = useState<UserRole>('parent');
  const [assignGroupId, setAssignGroupId] = useState('');
  const [assignChildId, setAssignChildId] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('parent');
  const [inviteGroupId, setInviteGroupId] = useState('');
  const [inviteChildId, setInviteChildId] = useState('');

  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantAddress, setNewTenantAddress] = useState('');
  const [pending, setPending] = useState(false);

  const loadStaticData = useCallback(async () => {
    setLoading(true);
    const tenantSnaps = await Promise.all(
      tenantIds.map(async (id) => {
        const snap = await getDoc(doc(db, paths.tenant(id)));
        return {
          id,
          name: snap.exists() ? (snap.data().name as string) : id,
        } as TenantSummary;
      })
    );

    const [tenantSnap, childrenSnap, groupsSnap] = await Promise.all([
      getDoc(doc(db, paths.tenant(tenantId))),
      getDocs(collection(db, paths.children(tenantId))),
      getDocs(collection(db, paths.groups(tenantId))),
    ]);

    setAllTenants(tenantSnaps);
    if (tenantSnap.exists()) {
      setTenant({ id: tenantSnap.id, ...tenantSnap.data() } as Tenant);
    } else {
      setTenant(null);
    }
    setChildren(childrenSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Child)));
    setGroups(groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Group)));
    setLoading(false);
  }, [tenantId, tenantIds.join('|')]);

  useEffect(() => {
    loadStaticData();
  }, [loadStaticData]);

  useEffect(() => {
    const unsubMembers = onSnapshot(collection(db, paths.members(tenantId)), (snap) => {
      const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as TenantMember));
      list.sort((a, b) => roleLabel(a.role).localeCompare(roleLabel(b.role)));
      setMembers(list);
    });
    const unsubInvites = onSnapshot(collection(db, paths.invitations(tenantId)), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invitation));
      setInvitations(list);
    });
    return () => {
      unsubMembers();
      unsubInvites();
    };
  }, [tenantId]);

  async function handleAssignRole() {
    const email = assignEmail.trim().toLowerCase();
    if (!email) return Alert.alert('Erreur', 'Indiquez l’email du compte.');
    if (assignRole === 'educator' && !assignGroupId) return Alert.alert('Erreur', 'Sélectionnez un groupe.');
    if (assignRole === 'parent' && !assignChildId) return Alert.alert('Erreur', 'Sélectionnez un enfant.');

    setPending(true);
    try {
      const setUserRole = httpsCallable(functions, 'setUserRole');
      await setUserRole({
        email,
        role: assignRole,
        tenantId,
        ...(assignRole === 'educator' && { groupIds: [assignGroupId] }),
        ...(assignRole === 'parent' && { childIds: [assignChildId] }),
      });
      Alert.alert('Rôle attribué', `Le compte ${email} est maintenant ${roleLabel(assignRole).toLowerCase()}.`);
      setShowAssignModal(false);
      setAssignEmail('');
    } catch (error) {
      Alert.alert('Erreur', getCallableErrorMessage(error, 'Impossible d’attribuer le rôle.'));
    } finally {
      setPending(false);
    }
  }

  async function handleCreateInvitation() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return Alert.alert('Erreur', 'Indiquez l’email du membre.');
    if (inviteRole === 'educator' && !inviteGroupId) return Alert.alert('Erreur', 'Sélectionnez un groupe.');
    if (inviteRole === 'parent' && !inviteChildId) return Alert.alert('Erreur', 'Sélectionnez un enfant.');

    setPending(true);
    try {
      const createInvitation = httpsCallable(functions, 'createInvitation');
      const result = await createInvitation({
        tenantId,
        email,
        role: inviteRole,
        ...(inviteRole === 'educator' && { groupIds: [inviteGroupId] }),
        ...(inviteRole === 'parent' && { childId: inviteChildId }),
      });
      const data = result.data as { inviteCode: string };
      Alert.alert('Invitation créée', `Code: ${data.inviteCode}\nEnvoyez ce code à ${email}.`);
      setShowInviteModal(false);
      setInviteEmail('');
    } catch (error) {
      Alert.alert('Erreur', getCallableErrorMessage(error, 'Impossible de créer l’invitation.'));
    } finally {
      setPending(false);
    }
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return Alert.alert('Erreur', 'Indiquez un nom de groupe.');
    setPending(true);
    try {
      await addDoc(collection(db, paths.groups(tenantId)), {
        name,
        educatorIds: [],
        createdAt: serverTimestamp(),
      });
      await loadStaticData();
      Alert.alert('Groupe créé', `Le groupe « ${name} » a été ajouté.`);
      setShowCreateGroupModal(false);
      setNewGroupName('');
    } catch (error) {
      Alert.alert('Erreur', getCallableErrorMessage(error, 'Impossible de créer le groupe.'));
    } finally {
      setPending(false);
    }
  }

  async function handleCreateChild() {
    const firstName = newChildFirstName.trim();
    const lastName = newChildLastName.trim();
    if (!firstName || !lastName) {
      return Alert.alert('Erreur', 'Prénom et nom requis.');
    }
    if (!newChildGroupId) {
      return Alert.alert('Erreur', 'Sélectionnez un groupe (créez-en un si besoin).');
    }
    setPending(true);
    try {
      await addDoc(collection(db, paths.children(tenantId)), {
        firstName,
        lastName,
        dateOfBirth: new Date(newChildDob),
        groupId: newChildGroupId,
        parentIds: [],
        allergies: [],
        enrollmentStatus: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await loadStaticData();
      Alert.alert('Enfant ajouté', `${firstName} ${lastName} a été inscrit(e).`);
      setShowCreateChildModal(false);
      setNewChildFirstName('');
      setNewChildLastName('');
      setNewChildGroupId('');
      setNewChildDob('2023-06-15');
    } catch (error) {
      Alert.alert('Erreur', getCallableErrorMessage(error, "Impossible d'ajouter l'enfant."));
    } finally {
      setPending(false);
    }
  }

  async function handleCreateTenant() {
    if (!newTenantName.trim()) return Alert.alert('Erreur', 'Nom de crèche requis.');
    setPending(true);
    try {
      const createTenant = httpsCallable(functions, 'createTenant');
      const result = await createTenant({ name: newTenantName.trim(), address: newTenantAddress.trim() });
      const data = result.data as { tenantId: string };
      await auth.currentUser?.getIdToken(true);
      onTenantChange(data.tenantId);
      Alert.alert('Crèche créée', `Nouvelle crèche: ${data.tenantId}`);
      setShowCreateTenantModal(false);
      setNewTenantName('');
      setNewTenantAddress('');
    } catch (error) {
      Alert.alert('Erreur', getCallableErrorMessage(error, 'Impossible de créer la crèche.'));
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#4a90d9" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarScroll} contentContainerStyle={styles.tabBarContent}>
        {(
          [
            ['overview', 'Vue d’ensemble'],
            ['members', 'Membres'],
            ['invitations', 'Invitations'],
            ['children', 'Enfants'],
            ['groups', 'Groupes'],
            ['annonces', 'Annonces'],
          ] as const
        ).map(([key, label]) => (
          <TouchableOpacity key={key} style={[styles.tab, tab === key && styles.tabActive]} onPress={() => setTab(key)}>
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === 'overview' && (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <Text style={styles.panelTitle}>Administration réseau</Text>

          {allTenants.length > 0 && (
            <View style={styles.tenantPickerSection}>
              <Text style={styles.fieldLabel}>Crèches gérées</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {allTenants.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.chip, tenantId === t.id && styles.chipActive]}
                      onPress={() => onTenantChange(t.id)}
                    >
                      <Text style={[styles.chipText, tenantId === t.id && styles.chipTextActive]}>
                        {t.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{tenant?.name ?? 'Crèche'}</Text>
            <Text style={styles.cardMeta}>{tenant?.address}</Text>
            <Text style={styles.cardMeta}>Statut : {tenant?.subscriptionStatus ?? '—'}</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCard}><Text style={styles.statValue}>{members.length}</Text><Text style={styles.statLabel}>Membres</Text></View>
            <View style={styles.statCard}><Text style={styles.statValue}>{children.length}</Text><Text style={styles.statLabel}>Enfants</Text></View>
            <View style={styles.statCard}><Text style={styles.statValue}>{groups.length}</Text><Text style={styles.statLabel}>Groupes</Text></View>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setShowCreateTenantModal(true)}>
            <Text style={styles.primaryButtonText}>+ Créer une nouvelle crèche</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            1. Créez des groupes (onglet Groupes){'\n'}
            2. Ajoutez des enfants (onglet Enfants){'\n'}
            3. Invitez les parents (onglet Invitations)
          </Text>
        </ScrollView>
      )}

      {tab === 'members' && (
        <View style={styles.panel}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setShowAssignModal(true)}>
            <Text style={styles.primaryButtonText}>+ Attribuer un rôle</Text>
          </TouchableOpacity>
          <FlatList
            data={members}
            keyExtractor={(item) => item.uid}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.listCard}>
                <Text style={styles.listTitle}>{item.displayName || item.email || item.uid}</Text>
                <Text style={styles.listMeta}>{item.email}</Text>
                <Text style={styles.roleBadge}>{roleLabel(item.role)}</Text>
              </View>
            )}
          />
        </View>
      )}

      {tab === 'invitations' && (
        <View style={styles.panel}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setShowInviteModal(true)}>
            <Text style={styles.primaryButtonText}>+ Inviter un membre</Text>
          </TouchableOpacity>
          <FlatList
            data={invitations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.listCard}>
                <Text style={styles.listTitle}>{item.email}</Text>
                <Text style={styles.listMeta}>
                  {roleLabel(item.role)} • Code: {item.inviteCode}
                </Text>
                <Text style={styles.listMeta}>{item.usedAt ? 'Utilisée' : 'En attente'}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Aucune invitation.</Text>}
          />
        </View>
      )}

      {tab === 'children' && (
        <View style={styles.panel}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setShowCreateChildModal(true)}>
            <Text style={styles.primaryButtonText}>+ Ajouter un enfant</Text>
          </TouchableOpacity>
          <FlatList
            data={children}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const group = groups.find((g) => g.id === item.groupId);
              return (
                <View style={styles.listCard}>
                  <Text style={styles.listTitle}>{item.firstName} {item.lastName}</Text>
                  <Text style={styles.listMeta}>Groupe : {group?.name ?? item.groupId}</Text>
                  <Text style={styles.listMeta}>
                    Parents liés : {item.parentIds?.length ?? 0}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Aucun enfant. Créez d&apos;abord un groupe, puis ajoutez un enfant.
              </Text>
            }
          />
        </View>
      )}

      {tab === 'groups' && (
        <View style={styles.panel}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setShowCreateGroupModal(true)}>
            <Text style={styles.primaryButtonText}>+ Créer un groupe</Text>
          </TouchableOpacity>
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.listCard}>
                <Text style={styles.listTitle}>{item.name}</Text>
                <Text style={styles.listMeta}>Éducateurs : {item.educatorIds?.length ?? 0}</Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>Aucun groupe. Créez par ex. « Bébés », « Moyens ».</Text>
            }
          />
        </View>
      )}

      {tab === 'annonces' && <AnnouncementsScreen tenantId={tenantId} canSend />}

      <Modal visible={showAssignModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}><ScrollView contentContainerStyle={styles.modalScroll}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Attribuer un rôle</Text>
          <TextInput style={styles.input} placeholder="email@exemple.com" value={assignEmail} onChangeText={setAssignEmail} autoCapitalize="none" />
          <Text style={styles.fieldLabel}>Rôle</Text>
          <View style={styles.chipRow}>{ASSIGNABLE_ROLES.map((r) => <TouchableOpacity key={r} style={[styles.chip, assignRole === r && styles.chipActive]} onPress={() => setAssignRole(r)}><Text style={[styles.chipText, assignRole === r && styles.chipTextActive]}>{roleLabel(r)}</Text></TouchableOpacity>)}</View>
          {assignRole === 'educator' && <View style={styles.chipRow}>{groups.map((g) => <TouchableOpacity key={g.id} style={[styles.chip, assignGroupId === g.id && styles.chipActive]} onPress={() => setAssignGroupId(g.id)}><Text style={[styles.chipText, assignGroupId === g.id && styles.chipTextActive]}>{g.name}</Text></TouchableOpacity>)}</View>}
          {assignRole === 'parent' && <View style={styles.chipRow}>{children.map((c) => <TouchableOpacity key={c.id} style={[styles.chip, assignChildId === c.id && styles.chipActive]} onPress={() => setAssignChildId(c.id)}><Text style={[styles.chipText, assignChildId === c.id && styles.chipTextActive]}>{c.firstName}</Text></TouchableOpacity>)}</View>}
          <TouchableOpacity style={[styles.primaryButton, pending && styles.buttonDisabled]} onPress={handleAssignRole} disabled={pending}><Text style={styles.primaryButtonText}>Confirmer</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAssignModal(false)}><Text style={styles.cancelButtonText}>Annuler</Text></TouchableOpacity>
        </View></ScrollView></View>
      </Modal>

      <Modal visible={showInviteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}><ScrollView contentContainerStyle={styles.modalScroll}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Inviter un membre</Text>
          <TextInput style={styles.input} placeholder="email@exemple.com" value={inviteEmail} onChangeText={setInviteEmail} autoCapitalize="none" />
          <Text style={styles.fieldLabel}>Rôle</Text>
          <View style={styles.chipRow}>{ASSIGNABLE_ROLES.map((r) => <TouchableOpacity key={r} style={[styles.chip, inviteRole === r && styles.chipActive]} onPress={() => setInviteRole(r)}><Text style={[styles.chipText, inviteRole === r && styles.chipTextActive]}>{roleLabel(r)}</Text></TouchableOpacity>)}</View>
          {inviteRole === 'educator' && <View style={styles.chipRow}>{groups.map((g) => <TouchableOpacity key={g.id} style={[styles.chip, inviteGroupId === g.id && styles.chipActive]} onPress={() => setInviteGroupId(g.id)}><Text style={[styles.chipText, inviteGroupId === g.id && styles.chipTextActive]}>{g.name}</Text></TouchableOpacity>)}</View>}
          {inviteRole === 'parent' && <View style={styles.chipRow}>{children.map((c) => <TouchableOpacity key={c.id} style={[styles.chip, inviteChildId === c.id && styles.chipActive]} onPress={() => setInviteChildId(c.id)}><Text style={[styles.chipText, inviteChildId === c.id && styles.chipTextActive]}>{c.firstName}</Text></TouchableOpacity>)}</View>}
          <TouchableOpacity style={[styles.primaryButton, pending && styles.buttonDisabled]} onPress={handleCreateInvitation} disabled={pending}><Text style={styles.primaryButtonText}>Créer invitation</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setShowInviteModal(false)}><Text style={styles.cancelButtonText}>Annuler</Text></TouchableOpacity>
        </View></ScrollView></View>
      </Modal>

      <Modal visible={showCreateGroupModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}><ScrollView contentContainerStyle={styles.modalScroll}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Créer un groupe</Text>
          <TextInput style={styles.input} placeholder="Ex. Bébés, Moyens, Grands" value={newGroupName} onChangeText={setNewGroupName} />
          <TouchableOpacity style={[styles.primaryButton, pending && styles.buttonDisabled]} onPress={handleCreateGroup} disabled={pending}><Text style={styles.primaryButtonText}>Créer</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCreateGroupModal(false)}><Text style={styles.cancelButtonText}>Annuler</Text></TouchableOpacity>
        </View></ScrollView></View>
      </Modal>

      <Modal visible={showCreateChildModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}><ScrollView contentContainerStyle={styles.modalScroll}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Ajouter un enfant</Text>
          <TextInput style={styles.input} placeholder="Prénom" value={newChildFirstName} onChangeText={setNewChildFirstName} />
          <TextInput style={styles.input} placeholder="Nom" value={newChildLastName} onChangeText={setNewChildLastName} />
          <Text style={styles.fieldLabel}>Date de naissance (AAAA-MM-JJ)</Text>
          <TextInput style={styles.input} placeholder="2023-06-15" value={newChildDob} onChangeText={setNewChildDob} autoCapitalize="none" />
          <Text style={styles.fieldLabel}>Groupe</Text>
          {groups.length === 0 ? (
            <Text style={styles.modalHint}>Créez d&apos;abord un groupe dans l&apos;onglet Groupes.</Text>
          ) : (
            <View style={styles.chipRow}>
              {groups.map((g) => (
                <TouchableOpacity key={g.id} style={[styles.chip, newChildGroupId === g.id && styles.chipActive]} onPress={() => setNewChildGroupId(g.id)}>
                  <Text style={[styles.chipText, newChildGroupId === g.id && styles.chipTextActive]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity style={[styles.primaryButton, pending && styles.buttonDisabled]} onPress={handleCreateChild} disabled={pending || groups.length === 0}><Text style={styles.primaryButtonText}>Ajouter</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCreateChildModal(false)}><Text style={styles.cancelButtonText}>Annuler</Text></TouchableOpacity>
        </View></ScrollView></View>
      </Modal>

      <Modal visible={showCreateTenantModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}><ScrollView contentContainerStyle={styles.modalScroll}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Créer une nouvelle crèche</Text>
          <TextInput style={styles.input} placeholder="Nom de la crèche" value={newTenantName} onChangeText={setNewTenantName} />
          <TextInput style={styles.input} placeholder="Adresse (optionnel)" value={newTenantAddress} onChangeText={setNewTenantAddress} />
          <TouchableOpacity style={[styles.primaryButton, pending && styles.buttonDisabled]} onPress={handleCreateTenant} disabled={pending}><Text style={styles.primaryButtonText}>Créer</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCreateTenantModal(false)}><Text style={styles.cancelButtonText}>Annuler</Text></TouchableOpacity>
        </View></ScrollView></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8f9fa' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBarScroll: {
    maxHeight: 48,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tabBarContent: { paddingHorizontal: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1a1a2e' },
  tabText: { fontSize: 13, color: '#888' },
  tabTextActive: { color: '#1a1a2e', fontWeight: '700' },
  panel: { flex: 1 },
  panelContent: { padding: 16 },
  panelTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  cardMeta: { fontSize: 14, color: '#666', marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '700', color: '#4a90d9' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  hint: { fontSize: 13, color: '#666', lineHeight: 20 },
  tenantPickerSection: { marginBottom: 16 },
  primaryButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    margin: 16,
    marginBottom: 8,
  },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },
  listContent: { padding: 16, paddingTop: 0 },
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  listTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  listMeta: { fontSize: 13, color: '#666', marginTop: 4 },
  roleBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    color: '#4a90d9',
    backgroundColor: '#eaf2fb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  empty: { textAlign: 'center', color: '#999', marginTop: 32, fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  modalHint: { fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 14,
  },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  chipActive: { backgroundColor: '#1a1a2e' },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  cancelButton: { marginTop: 10, alignItems: 'center', padding: 10 },
  cancelButtonText: { color: '#888', fontSize: 14 },
});
