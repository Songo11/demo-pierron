import { Platform, StyleSheet } from 'react-native';

import type { AppThemeColors } from './appTheme';

/** Plain style defs (pass to StyleSheet.create). */
export function tabScreenStyleDefs(c: AppThemeColors) {
  return {
    container: {
      flexGrow: 1,
      backgroundColor: c.background,
      padding: 24,
      alignItems: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: c.text,
      marginTop: 40,
      marginBottom: 16,
    },
    subtitle: {
      fontSize: 14,
      color: c.textSecondary,
      marginBottom: 28,
      textAlign: 'center',
      lineHeight: 20,
    },
    connectedContainer: {
      width: '100%',
      alignItems: 'center',
    },
    card: {
      width: '100%',
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardLabel: {
      color: c.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 12,
    },
    fieldLabel: {
      color: c.textSecondary,
      fontSize: 13,
      marginBottom: 6,
    },
    address: {
      fontSize: 14,
      color: c.accent,
      textAlign: 'center',
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    poolOk: {
      color: c.success,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 6,
    },
    poolDetail: {
      color: c.textMuted,
      fontSize: 12,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      marginBottom: 4,
    },
    infoTable: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      marginBottom: 12,
      overflow: 'hidden',
      backgroundColor: c.surfaceAlt,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 12,
    },
    infoRowLast: {
      borderBottomWidth: 0,
    },
    infoLabel: {
      color: c.textSecondary,
      fontSize: 13,
      flexShrink: 1,
    },
    infoValue: {
      color: c.text,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'right',
    },
    infoValueMuted: {
      color: c.textMuted,
      fontSize: 13,
      textAlign: 'right',
    },
    balanceLine: {
      color: c.accent,
      fontSize: 14,
      fontWeight: '600',
      marginTop: 8,
    },
    modeRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
      width: '100%',
    },
    modeButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surfaceElevated,
      alignItems: 'center',
    },
    modeButtonActive: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    modeButtonText: {
      color: c.textSecondary,
      fontWeight: '600',
      fontSize: 14,
    },
    modeButtonTextActive: {
      color: c.accent,
    },
    input: {
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: c.text,
      fontSize: 16,
      marginBottom: 12,
      width: '100%',
    },
    button: {
      backgroundColor: c.primaryButtonBg,
      borderRadius: 12,
      paddingVertical: 15,
      paddingHorizontal: 20,
      alignItems: 'center',
      marginBottom: 12,
      width: '100%',
    },
    buttonText: {
      color: c.primaryButtonText,
      fontSize: 16,
      fontWeight: '700',
    },
    buttonSecondary: {
      backgroundColor: c.surfaceElevated,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 20,
      alignItems: 'center',
      marginBottom: 12,
      width: '100%',
      borderWidth: 1,
      borderColor: c.secondaryButtonBorder,
    },
    buttonTextSecondary: {
      color: c.textSecondary,
      fontSize: 15,
      fontWeight: '600',
    },
    hint: {
      color: c.textMuted,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 16,
    },
    loader: {
      marginVertical: 24,
    },
    errorText: {
      color: c.error,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 12,
    },
    emptyText: {
      color: c.textMuted,
      fontSize: 14,
      textAlign: 'center',
      marginTop: 24,
    },
    historyItem: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
      width: '100%',
    },
    historyTitle: {
      color: c.text,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 4,
    },
    historyDetail: {
      color: c.textSecondary,
      fontSize: 12,
    },
    historyTime: {
      color: c.textMuted,
      fontSize: 11,
      marginTop: 4,
    },
    clearButton: {
      backgroundColor: c.surfaceElevated,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 8,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    clearButtonText: {
      color: c.errorSoft,
      fontWeight: '600',
    },
  } as const;
}

export function createTabScreenStyles(c: AppThemeColors) {
  return StyleSheet.create(tabScreenStyleDefs(c) as Record<string, object>);
}
