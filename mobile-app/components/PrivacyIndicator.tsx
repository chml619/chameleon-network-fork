import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function PrivacyIndicator() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🛡️</Text>
      <Text style={styles.text}>Private</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  icon: { marginRight: 4 },
  text: { color: '#10B981', fontSize: 12, fontWeight: '600' },
});