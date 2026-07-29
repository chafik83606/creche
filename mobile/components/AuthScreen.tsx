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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';
import { getAppVersionLabel } from '../lib/app-version';
import { clearSavedLogin, loadSavedLogin, saveLogin } from '../lib/saved-credentials';

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
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.versionBadge}>{versionLabel}</Text>

      <View style={styles.card}>
        <Text style={styles.logo}>🏫</Text>
        <Text style={styles.title}>Crèche</Text>
        <Text style={styles.subtitle}>
          {isRegister ? 'Créer un compte' : 'Connexion'}
        </Text>

        {isRegister && (
          <TextInput
            style={styles.input}
            placeholder="Nom complet"
            value={displayName}
            onChangeText={setDisplayName}
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
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
              color="#666"
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
              color={rememberMe ? '#4a90d9' : '#999'}
            />
            <Text style={styles.rememberText}>Se souvenir de moi</Text>
          </TouchableOpacity>
        )}

        {isRegister && (
          <TextInput
            style={styles.input}
            placeholder="Code d'invitation (optionnel)"
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
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4a90d9',
    justifyContent: 'center',
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#4a90d9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  versionBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 72 : 40,
    left: 20,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  logo: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', color: '#1a1a2e' },
  subtitle: { fontSize: 14, textAlign: 'center', color: '#666', marginBottom: 24, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    marginBottom: 12,
    paddingRight: 8,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 15,
  },
  eyeButton: {
    padding: 8,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  rememberText: {
    fontSize: 14,
    color: '#444',
  },
  button: {
    backgroundColor: '#4a90d9',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switchText: { textAlign: 'center', color: '#4a90d9', marginTop: 16, fontSize: 14 },
});
