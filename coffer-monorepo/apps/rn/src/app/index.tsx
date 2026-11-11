import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getKek, getProfile, getToken } from '@coffer/vault-core';

import { colors } from '../constants/theme';

export default function BootstrapScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      const profile = getProfile();
      const token = getToken();
      if (!profile || !token) {
        router.replace('/auth');
        return;
      }
      router.replace(getKek() ? '/vault' : '/lock');
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.root}>
      <Image source={require('../../assets/icon.png')} style={styles.logo} />
      <Text style={styles.name}>Coffer</Text>
      <Text style={styles.hint}>零知识加密保险库</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 58, height: 58, borderRadius: 16 },
  name: { marginTop: 13, fontSize: 17, fontWeight: '600', color: colors.ink, letterSpacing: 1 },
  hint: { marginTop: 5, fontSize: 10.5, color: colors.muted, letterSpacing: 0.6 },
});
