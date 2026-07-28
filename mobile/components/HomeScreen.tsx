import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { DailyTrackingScreen } from './DailyTrackingScreen';
import { AnnouncementsScreen } from './AnnouncementsScreen';
import { ConsentScreen } from './ConsentScreen';
import { registerForPushNotifications, addNotificationListeners } from '../lib/notifications';
import type { UserRole } from '@creche/shared';

// IDs de démo — à remplacer par la sélection dynamique en production
const DEMO_TENANT_ID = 'demo-creche';
const DEMO_CHILD_ID = 'demo-child-001';
const DEMO_CHILD_NAME = 'Léa Martin';

type Tab = 'carnet' | 'annonces' | 'consent';

function EducatorHome() {
  const [tab, setTab] = React.useState<Tab>('carnet');

  return (
    <View style={styles.flex}>
      <View style={styles.tabBar}>
        <TabButton label="Carnet" active={tab === 'carnet'} onPress={() => setTab('carnet')} />
        <TabButton label="Annonces" active={tab === 'annonces'} onPress={() => setTab('annonces')} />
      </View>
      {tab === 'carnet' && (
        <DailyTrackingScreen
          tenantId={DEMO_TENANT_ID}
          childId={DEMO_CHILD_ID}
          childName={DEMO_CHILD_NAME}
        />
      )}
      {tab === 'annonces' && (
        <AnnouncementsScreen tenantId={DEMO_TENANT_ID} canSend />
      )}
    </View>
  );
}

function ParentHome() {
  const [tab, setTab] = React.useState<Tab>('carnet');
  const [consentDone, setConsentDone] = React.useState(false);

  if (!consentDone) {
    return (
      <ConsentScreen
        tenantId={DEMO_TENANT_ID}
        childId={DEMO_CHILD_ID}
        onComplete={() => setConsentDone(true)}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.tabBar}>
        <TabButton label="Annonces" active={tab === 'annonces'} onPress={() => setTab('annonces')} />
      </View>
      {tab === 'annonces' && <AnnouncementsScreen tenantId={DEMO_TENANT_ID} />}
    </View>
  );
}

function ManagementHome({ role }: { role: UserRole }) {
  return (
    <ScrollView style={styles.managementContainer}>
      <Text style={styles.managementTitle}>
        {role === 'network_admin' ? 'Admin réseau' : 'Directeur'}
      </Text>
      <Text style={styles.managementText}>
        Tableau de bord de gestion — à compléter pour le MVP.
      </Text>
      <AnnouncementsScreen tenantId={DEMO_TENANT_ID} canSend />
    </ScrollView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function HomeScreen() {
  const { role, user } = useAuth();

  useEffect(() => {
    if (!user) return;

    registerForPushNotifications(DEMO_TENANT_ID).catch((err) => {
      console.warn('Enregistrement push échoué:', err);
    });

    return addNotificationListeners();
  }, [user]);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Crèche</Text>
        <TouchableOpacity onPress={() => signOut(auth)}>
          <Text style={styles.logout}>Déconnexion</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.welcome}>
        Bonjour {user?.displayName ?? user?.email}
      </Text>

      {role === 'educator' && <EducatorHome />}
      {role === 'parent' && <ParentHome />}
      {(role === 'director' || role === 'network_admin') && (
        <ManagementHome role={role} />
      )}
      {!role && (
        <View style={styles.noRole}>
          <Text style={styles.noRoleText}>
            Votre compte n'a pas encore de rôle attribué.{'\n'}
            Contactez l'administrateur de votre crèche.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#4a90d9',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  logout: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  welcome: { padding: 16, fontSize: 15, color: '#444', backgroundColor: '#fff' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#4a90d9' },
  tabText: { fontSize: 14, color: '#888' },
  tabTextActive: { color: '#4a90d9', fontWeight: '600' },
  noRole: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  noRoleText: { textAlign: 'center', color: '#666', fontSize: 15, lineHeight: 22 },
  managementContainer: { flex: 1 },
  managementTitle: { fontSize: 22, fontWeight: '700', padding: 16, color: '#1a1a2e' },
  managementText: { paddingHorizontal: 16, color: '#666', marginBottom: 8 },
});
