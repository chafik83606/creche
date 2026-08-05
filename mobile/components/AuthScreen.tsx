import React, { useEffect, useRef, useState } from 'react';
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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';
import { getAppVersionLabel } from '../lib/app-version';
import { clearSavedLogin, loadSavedLogin, saveLogin } from '../lib/saved-credentials';
import { colors, radius, shadow, spacing } from '../lib/theme';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [maskPassword, setMaskPassword] = useState(true);
  const maskTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);

  const versionLabel = getAppVersionLabel();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadSavedLogin();
      if (cancelled) return;
      if (saved) {
        setEmail(saved.email);
        setPassword(saved.password);
        setRememberMe(true);
      }
      setCredentialsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (maskTimeoutRef.current) clearTimeout(maskTimeoutRef.current);
    };
  }, []);

  function handlePasswordChange(text: string) {
    setPassword(text);
    if (showPassword) return;
    setMaskPassword(false);
    if (maskTimeoutRef.current) clearTimeout(maskTimeoutRef.current);
    maskTimeoutRef.current = setTimeout(() => setMaskPassword(true), Platform.OS === 'android' ? 900 : 0);
  }

  async function persistLoginIfNeeded() {
    if (!isRegister && rememberMe) {
      await saveLogin(email.trim().toLowerCase(), password);
      return;
    }
    await clearSavedLogin();
  }

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs.');
      return;
    }
    if (isRegister && !displayName.trim()) {
      Alert.alert('Erreur', 'Veuillez renseigner votre nom.');
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        if (inviteCode.trim()) {
          const registerWithInvite = httpsCallable(functions, 'registerWithInvite');
          await registerWithInvite({
            email: email.trim().toLowerCase(),
            password,
            displayName: displayName.trim(),
            inviteCode: inviteCode.trim().toUpperCase(),
          });
          await signInWithEmailAndPassword(auth, email.trim(), password);
          Alert.alert('Compte créé', 'Inscription via invitation réussie.');
        } else {
          await createUserWithEmailAndPassword(auth, email.trim(), password);
          Alert.alert(
            'Compte créé',
            'Compte créé. Créez ensuite votre première crèche pour activer le rôle admin.'
          );
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        await persistLoginIfNeeded();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de connexion';
      Alert.alert('Erreur', message);
    } finally {
      setLoading(false);
    }
  }

  if (!credentialsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.textOnPrimary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.heroDecorLarge} />
      <View style={styles.heroDecorSmall} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.versionBadge}>{versionLabel}</Text>

        <View style={styles.hero}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoLetter}>Z</Text>
          </View>
          <Text style={styles.brandTitle}>Zibou</Text>
          <Text style={styles.brandSubtitle}>Suivi quotidien en crèche</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isRegister ? 'Créer un compte' : 'Connexion'}
          </Text>
          <Text style={styles.cardHint}>
            {isRegister
              ? 'Rejoignez votre crèche avec un code invitation ou créez un espace admin.'
              : 'Accédez au carnet, aux annonces et à la messagerie.'}
          </Text>

          {isRegister && (
            <TextInput
              style={styles.input}
              placeholder="Nom complet"
              placeholderTextColor={colors.textMuted}
              value={displayName}
              onChangeText={setDisplayName}
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            autoComplete="email"
          />

          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Mot de passe"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry={!showPassword && (Platform.OS === 'ios' || maskPassword)}
              textContentType={isRegister ? 'newPassword' : 'password'}
              autoCapitalize="none"
              autoCorrect={false}
              importantForAutofill="no"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => {
                setShowPassword((prev) => !prev);
                setMaskPassword(true);
              }}
              accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {!isRegister && (
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe((prev) => !prev)}
            >
              <Ionicons
                name={rememberMe ? 'checkbox' : 'square-outline'}
                size={22}
                color={rememberMe ? colors.primary : colors.textMuted}
              />
              <Text style={styles.rememberText}>Se souvenir de moi</Text>
            </TouchableOpacity>
          )}

          {isRegister && (
            <TextInput
              style={styles.input}
              placeholder="Code d'invitation (optionnel)"
              placeholderTextColor={colors.textMuted}
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.buttonText}>
                {isRegister ? 'Créer le compte' : 'Se connecter'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsRegister(!isRegister)}>
            <Text style={styles.switchText}>
              {isRegister
                ? 'Déjà un compte ? Se connecter'
                : 'Pas de compte ? Créer un compte'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroDecorLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -60,
    right: -70,
  },
  heroDecorSmall: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: 120,
    left: -40,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxl,
  },
  versionBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 24,
    left: 0,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoLetter: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.textOnPrimary,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    marginTop: spacing.xs,
    fontSize: 15,
    color: 'rgba(255,255,255,0.88)',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    ...shadow.card,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  cardHint: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 15,
    marginBottom: spacing.md,
    color: colors.text,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    paddingRight: spacing.sm,
  },
  passwordInput: {
    flex: 1,
    padding: spacing.lg,
    fontSize: 15,
    color: colors.text,
  },
  eyeButton: {
    padding: spacing.sm,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  rememberText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: '700' },
  switchText: {
    textAlign: 'center',
    color: colors.primary,
    marginTop: spacing.lg,
    fontSize: 14,
    fontWeight: '600',
  },
});
