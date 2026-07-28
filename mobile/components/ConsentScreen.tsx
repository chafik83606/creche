import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { paths } from '@creche/shared';
import type { ConsentType } from '@creche/shared';

const CONSENT_VERSION = '1.0.0';

const CONSENT_TEXTS: Record<ConsentType, { title: string; body: string }> = {
  gdpr_data: {
    title: 'Consentement — Données personnelles (RGPD)',
    body:
      'Conformément au Règlement Général sur la Protection des Données (RGPD), ' +
      'j\'accepte que les données personnelles de mon enfant (identité, suivi quotidien, ' +
      'données de santé) soient collectées et traitées par la crèche dans le cadre du suivi ' +
      'éducatif et de la communication avec les familles.\n\n' +
      'Ces données sont hébergées sur des serveurs certifiés HDS situés en France. ' +
      'Elles seront conservées pendant la durée de scolarisation de mon enfant, puis ' +
      'supprimées dans un délai de 30 jours après son départ.\n\n' +
      'Je dispose d\'un droit d\'accès, de rectification et de suppression de ces données, ' +
      'exerçable à tout moment auprès de la direction de la crèche.',
  },
  image_rights: {
    title: 'Autorisation — Droit à l\'image',
    body:
      'J\'autorise la crèche à prendre des photos de mon enfant dans le cadre des activités ' +
      'éducatives et à les partager avec moi exclusivement via l\'application.\n\n' +
      'Ces photos ne seront pas diffusées publiquement ni partagées avec d\'autres familles. ' +
      'Elles seront stockées de manière sécurisée et supprimées à la fin de la scolarisation.\n\n' +
      'Je peux révoquer cette autorisation à tout moment depuis l\'application. ' +
      'La révocation n\'a pas d\'effet rétroactif sur les photos déjà partagées.',
  },
};

interface Props {
  tenantId: string;
  childId: string;
  onComplete: () => void;
}

export function ConsentScreen({ tenantId, childId, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const [imageAccepted, setImageAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const steps: ConsentType[] = ['gdpr_data', 'image_rights'];
  const currentType = steps[step];
  const current = CONSENT_TEXTS[currentType];
  const isAccepted = step === 0 ? gdprAccepted : imageAccepted;

  async function handleNext() {
    if (step === 0 && !gdprAccepted) {
      Alert.alert('Requis', 'Vous devez accepter le traitement des données pour continuer.');
      return;
    }

    if (step === 0) {
      setStep(1);
      return;
    }

    await saveConsents();
  }

  async function saveConsents() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSaving(true);
    try {
      const consentsRef = collection(db, paths.consents(tenantId));

      await addDoc(consentsRef, {
        childId,
        parentId: uid,
        type: 'gdpr_data',
        accepted: gdprAccepted,
        signedAt: serverTimestamp(),
        version: CONSENT_VERSION,
      });

      await addDoc(consentsRef, {
        childId,
        parentId: uid,
        type: 'image_rights',
        accepted: imageAccepted,
        signedAt: serverTimestamp(),
        version: CONSENT_VERSION,
      });

      onComplete();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'enregistrer les consentements.');
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.progress}>
        <Text style={styles.progressText}>Étape {step + 1} / {steps.length}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((step + 1) / steps.length) * 100}%` }]} />
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
            ? 'J\'accepte le traitement des données de mon enfant'
            : 'J\'autorise la prise et le partage de photos de mon enfant'}
          {step === 1 && ' (optionnel)'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, (step === 0 && !gdprAccepted) && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={saving || (step === 0 && !gdprAccepted)}
      >
        <Text style={styles.buttonText}>
          {saving ? 'Enregistrement...' : step === 0 ? 'Continuer' : 'Terminer'}
        </Text>
      </TouchableOpacity>

      {step === 1 && (
        <TouchableOpacity style={styles.skipButton} onPress={saveConsents}>
          <Text style={styles.skipText}>Refuser l'autorisation image et terminer</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 20 },
  progress: { marginBottom: 24 },
  progressText: { fontSize: 13, color: '#666', marginBottom: 6 },
  progressBar: { height: 4, backgroundColor: '#e0e0e0', borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: '#4a90d9', borderRadius: 2 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 16 },
  bodyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#4a90d9',
  },
  bodyText: { fontSize: 14, lineHeight: 22, color: '#444' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4a90d9',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#4a90d9' },
  checkmark: { color: '#fff', fontWeight: '700', fontSize: 14 },
  checkboxLabel: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  button: {
    backgroundColor: '#4a90d9',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  skipButton: { marginTop: 12, alignItems: 'center', padding: 10 },
  skipText: { color: '#999', fontSize: 13, textDecorationLine: 'underline' },
});
