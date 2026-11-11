import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

type ToastListener = (message: string) => void;

const listeners = new Set<ToastListener>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** 全局轻提示：不依赖组件树，共享业务代码也可以直接调用。 */
export function toast(message: string): void {
  if (!message) {
    return;
  }
  for (const listener of listeners) {
    listener(message);
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const listener: ToastListener = (next) => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      setMessage(next);
      opacity.stopAnimation();
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      hideTimer = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start();
        hideTimer = null;
      }, 2100);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };
  }, [opacity]);

  return (
    <View style={styles.root}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]}>
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 104,
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 60,
  },
  text: {
    maxWidth: 340,
    backgroundColor: 'rgba(24, 22, 19, 0.92)',
    color: '#FFFFFF',
    fontSize: 12.5,
    lineHeight: 18,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
  },
});
