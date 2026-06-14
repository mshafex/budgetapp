/**
 * ScreenContainer (DESIGN) — the standard screen shell.
 * Implements `ScreenContainerProps` from `@/contracts/components`.
 *
 * - Fills the screen with the theme background; safe-area aware.
 * - Optional `state` tint applies a subtle top edge so Home's safe/survival state is
 *   felt even before the number is read. Default 'safe'.
 * - `padded` adds default screen padding (default true).
 * - RTL-safe: only vertical + symmetric padding; no left/right.
 */
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ScreenContainerProps } from '@/contracts/components';
import { theme } from '@/theme';

export function ScreenContainer({
  children,
  state = 'safe',
  padded = true,
}: ScreenContainerProps) {
  const accent = state === 'survival' ? theme.colors.survival : theme.colors.safe;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
      <View style={[styles.content, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
});

export default ScreenContainer;
