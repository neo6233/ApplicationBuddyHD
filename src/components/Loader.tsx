import React, {useEffect, useRef} from 'react';
import {View, Text, StyleSheet, Animated} from 'react-native';
import Colors from '../constants/Colors';

interface LoaderProps {
  message?: string;
  overlay?: boolean;
}

const TypingDot: React.FC<{delay: number}> = ({delay}) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, delay]);

  return (
    <Animated.View style={[styles.dot, {opacity}]} />
  );
};

const Loader: React.FC<LoaderProps> = ({message, overlay = false}) => {
  if (overlay) {
    return (
      <View style={styles.overlay}>
        <View style={styles.overlayContent}>
          <View style={styles.dotsContainer}>
            <TypingDot delay={0} />
            <TypingDot delay={200} />
            <TypingDot delay={400} />
          </View>
          {message && <Text style={styles.overlayMessage}>{message}</Text>}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.inline}>
      <View style={styles.dotsContainer}>
        <TypingDot delay={0} />
        <TypingDot delay={200} />
        <TypingDot delay={400} />
      </View>
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
};

// Typing indicator for chat
export const TypingIndicator: React.FC = () => {
  return (
    <View style={styles.typingRow}>
      <View style={styles.typingAvatar}>
        <Text style={styles.typingAvatarText}>A</Text>
      </View>
      <View style={styles.typingBubble}>
        <TypingDot delay={0} />
        <TypingDot delay={200} />
        <TypingDot delay={400} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  inline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  overlay: {
    // ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  overlayContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  message: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  overlayMessage: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    marginVertical: 6,
    gap: 8,
  },
  typingAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typingAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  typingBubble: {
    flexDirection: 'row',
    gap: 5,
    backgroundColor: Colors.bubbleAI,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    alignItems: 'center',
  },
});

export default Loader;