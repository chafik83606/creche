import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../lib/theme';
import { auth } from '../lib/firebase';
import type { Consent, ConsentType } from '@creche/shared';
import {
  CONSENT_TEXTS,
  isConsentActive,
  loadConsentsForChild,
  revokeConsent,
  saveConsent,
} from '../lib/consents';

interface Props {
  tenantId: string;
  childId: string;
  childName: string;
  /** Appelé si le consentement RGPD est retiré (bloque l’accès app). */
  onGdprRevoked?: () => void;
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Text style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}>
      {active ? 'Actif' : 'Retiré'}
    </Text>
  );
}

export function ConsentManageScreen({
  tenantId,
  childId,
  childName,
  onGdprRevoked,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gdpr, setGdpr] = useState<(Consent & { id: string }) | null>(null);
  const [image, setImage] = useState<(Consent & { id: string }) | null>(null);

  const uid = auth.currentUser?.uid;

  async function refresh() {
    if (!uid) return;
    setLoading(true);
    try {
      const data = await loadConsentsForChild(tenantId, uid, childId);
      setGdpr(data.gdpr);
      setImage(data.image);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [tenantId, childId, uid]);

  function confirmRevoke(type: ConsentType) {
    const isGdpr = type === 'gdpr_data';
    Alert.alert(
      'Retirer le consentement ?',
      isGdpr
        ? `En retirant le consentement RGPD pour ${childName}, vous ne pourrez plus utiliser l'application pour cet enfant tant que vous ne l'aurez pas redonné. Les données déjà collectées restent gérées par la crèche selon la réglementation.`
        : `Vous retirez l'autorisation de droit à l'image pour ${childName}. La crèche ne pourra plus partager de nouvelles photos. Cela n'efface pas les photos déjà partagées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => doRevoke(type),
        },
      ]
    );
  }

  async function doRevoke(type: ConsentType) {
    if (!uid) return;
    setSaving(true);
    try {
      await revokeConsent(tenantId, uid, childId, type);
      await refresh();
      if (type === 'gdpr_data') {
        onGdprRevoked?.();
      } else {
        Alert.alert('Consentement retiré', "L'autorisation image a été retirée.");
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de retirer le consentement.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  async function reAccept(type: ConsentType) {
    if (!uid) return;
    setSaving(true);
    try {
      await saveConsent(tenantId, uid, childId, type, true);
      await refresh();
      Alert.alert('Enregistré', 'Consentement enregistré.');
    } catch (error) {
      Alert.alert('Erreur', "Impossible d'enregistrer le consentement.");
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const items: { type: ConsentType; consent: (Consent & { id: string }) | null }[] = [
    { type: 'gdpr_data', consent: gdpr },
    { type: 'image_rights', consent: image },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Consentements — {childName}</Text>
      <Text style={styles.intro}>
        Vous pouvez retirer ou redonner vos consentements à tout moment.
      </Text>

      {items.map(({ type, consent }) => {
        const meta = CONSENT_TEXTS[type];
        const active = isConsentActive(consent);
        return (
          <View key={type} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{meta.title}</Text>
              <StatusBadge active={active} />
            </View>
            <Text style={styles.cardBody} numberOfLines={4}>
              {meta.body}
            </Text>
            {active ? (
              <TouchableOpacity
                style={styles.revokeButton}
                onPress={() => confirmRevoke(type)}
                disabled={saving}
              >
                <Text style={styles.revokeButtonText}>Retirer mon consentement</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.acceptButton}
                onPress={() => reAccept(type)}
                disabled={saving}
              >
                <Text style={styles.acceptButtonText}>
                  {type === 'gdpr_data' ? 'Redonner mon consentement' : 'Autoriser à nouveau'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  intro: { fontSize: 14, color: '#666', marginBottom: 16, lineHeight: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  badgeActive: { color: '#27ae60', backgroundColor: '#eafaf1' },
  badgeInactive: { color: '#c0392b', backgroundColor: '#fdecea' },
  cardBody: { fontSize: 13, color: '#666', lineHeight: 19, marginBottom: 14 },
  revokeButton: {
    borderWidth: 1,
    borderColor: '#e74c3c',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  revokeButtonText: { color: '#e74c3c', fontWeight: '600', fontSize: 14 },
  acceptButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  acceptButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
