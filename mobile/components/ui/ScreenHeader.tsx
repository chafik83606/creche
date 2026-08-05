import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../lib/theme';

interface Props {
  title: string;
  subtitle?: string;
  onLogout?: () => void;
}

export function ScreenHeader({ title, subtitle, onLogout }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingTop: Math.max(insets.top, 12) + spacing.sm }]}>
      <View style={styles.decorCircleLarge} />
      <View style={styles.decorCircleSmall} />
      <View style={styles.row}>
        <View style={styles.brandBlock}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoLetter}>Z</Text>
          </View>
          <View>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        {onLogout ? (
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={20} color={colors.textOnPrimary} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
  },
  decorCircleLarge: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40,
    right: -30,
  },
  decorCircleSmall: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -20,
    left: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textOnPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
