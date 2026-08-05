import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { auth } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { colors, radius, shadow, spacing } from '../lib/theme';

interface Props {
  onDone: () => void;
}

export function OnboardingScreen({ onDone }: Props) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Indiquez le nom de la crèche.');
      return;
    }

    setLoading(true);
    try {
      const createTenant = httpsCallable(functions, 'createTenant');
      const result = await createTenant({
        name: name.trim(),
        address: address.trim(),
      });
      await auth.currentUser?.getIdToken(true);
      const tenantId = (result.data as { tenantId?: string }).tenantId ?? 'nouvelle-crèche';
      Alert.alert(
        'Crèche créée',
        `La crèche a été créée (${tenantId}) et votre compte est maintenant admin réseau.`
      );
      onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de créer la crèche.';
      Alert.alert('Erreur', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <View style={styles.iconBadge}>
          <Text style={styles.iconText}>🏫</Text>
        </View>
        <Text style={styles.title}>Bienvenue</Text>
        <Text style={styles.subtitle}>
          Créez votre première crèche pour activer votre espace administrateur.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Nom de la crèche"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Adresse (optionnel)"
          placeholderTextColor={colors.textMuted}
          value={address}
          onChangeText={setAddress}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.buttonText}>Créer ma crèche</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.info}>
          Le premier compte devient automatiquement administrateur réseau.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.card,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconText: { fontSize: 28 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    marginBottom: spacing.sm,
    color: colors.text,
  },
  button: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 15 },
  info: { marginTop: spacing.md, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
