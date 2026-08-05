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
import type { ConsentType } from '@creche/shared';
import {
  CONSENT_TEXTS,
  isConsentActive,
  loadConsent,
  saveConsent,
} from '../lib/consents';

interface Props {
  tenantId: string;
  childId: string;
  onComplete: () => void;
}

export function ConsentScreen({ tenantId, childId, onComplete }: Props) {
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState(0);
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const [imageAccepted, setImageAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const steps: ConsentType[] = ['gdpr_data', 'image_rights'];
  const currentType = steps[step];
  const current = CONSENT_TEXTS[currentType];
  const isAccepted = step === 0 ? gdprAccepted : imageAccepted;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setChecking(false);
        return;
      }
      try {
        const existing = await loadConsent(tenantId, uid, childId, 'gdpr_data');
        if (!cancelled && isConsentActive(existing)) {
          onComplete();
          return;
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, childId]);

  async function handleNext() {
    if (step === 0 && !gdprAccepted) {
      Alert.alert('Requis', 'Vous devez accepter le traitement des données pour continuer.');
      return;
    }

    if (step === 0) {
      setStep(1);
      return;
    }

    await persistConsents(gdprAccepted, imageAccepted);
  }

  async function persistConsents(gdpr: boolean, image: boolean) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSaving(true);
    try {
      await saveConsent(tenantId, uid, childId, 'gdpr_data', gdpr);
      await saveConsent(tenantId, uid, childId, 'image_rights', image);
      onComplete();
    } catch (error) {
      Alert.alert('Erreur', "Impossible d'enregistrer les consentements.");
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  function toggleAcceptance() {
    if (step === 0) {
      setGdprAccepted(!gdprAccepted);
    } else {
      setImageAccepted(!imageAccepted);
    }
  }

  if (checking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.progress}>
        <Text style={styles.progressText}>
          Étape {step + 1} / {steps.length}
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${((step + 1) / steps.length) * 100}%` }]}
          />
        </View>
      </View>

      <Text style={styles.title}>{current.title}</Text>

      <View style={styles.bodyCard}>
        <Text style={styles.bodyText}>{current.body}</Text>
      </View>

      <TouchableOpacity style={styles.checkboxRow} onPress={toggleAcceptance}>
        <View style={[styles.checkbox, isAccepted && styles.checkboxChecked]}>
          {isAccepted && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkboxLabel}>
          {step === 0
            ? "J'accepte le traitement des données de mon enfant"
            : "J'autorise la prise et le partage de photos de mon enfant"}
          {step === 1 && ' (optionnel)'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, step === 0 && !gdprAccepted && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={saving || (step === 0 && !gdprAccepted)}
      >
        <Text style={styles.buttonText}>
          {saving ? 'Enregistrement...' : step === 0 ? 'Continuer' : 'Terminer'}
        </Text>
      </TouchableOpacity>

      {step === 1 && (
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => {
            setImageAccepted(false);
            persistConsents(gdprAccepted, false);
          }}
        >
          <Text style={styles.skipText}>Refuser l'autorisation image et terminer</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  progress: { marginBottom: 24 },
  progressText: { fontSize: 13, color: '#666', marginBottom: 6 },
  progressBar: { height: 4, backgroundColor: '#e0e0e0', borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 16 },
  bodyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  bodyText: { fontSize: 14, lineHeight: 22, color: '#444' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary },
  checkmark: { color: '#fff', fontWeight: '700', fontSize: 14 },
  checkboxLabel: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  skipButton: { marginTop: 12, alignItems: 'center', padding: 10 },
  skipText: { color: '#999', fontSize: 13, textDecorationLine: 'underline' },
});
