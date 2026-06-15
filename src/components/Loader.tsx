import React, {useEffect, useRef} from 'react';
import {View, Text, StyleSheet, Animated, Image} from 'react-native';
import Colors from '../constants/Colors';

interface LoaderProps {
  message?: string;
  overlay?: boolean;
}

const TypingDot: React.FC<{delay: number; color?: string}> = ({delay, color = Colors.accent}) => {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.2,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.4,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.8,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, scale, delay]);

  return (
    <Animated.View style={[styles.dot, {backgroundColor: color, opacity, transform: [{scale}]}]} />
  );
};

const Loader: React.FC<LoaderProps> = ({message, overlay = false}) => {
  if (overlay) {
    return (
      <View style={styles.overlay}>
        <View style={styles.overlayContent}>
          <View style={styles.dotsContainer}>
            <TypingDot delay={0} color={Colors.accent} />
            <TypingDot delay={150} color={Colors.secondary} />
            <TypingDot delay={300} color={Colors.accentLight} />
          </View>
          {message && <Text style={styles.overlayMessage}>{message}</Text>}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.inline}>
      <View style={styles.dotsContainer}>
        <TypingDot delay={0} color={Colors.accent} />
        <TypingDot delay={150} color={Colors.secondary} />
        <TypingDot delay={300} color={Colors.accentLight} />
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
        <Image
          source={require('../assets/aria_logo.png')}
          style={styles.avatarImage}
          resizeMode="cover"
        />
      </View>
      <View style={styles.typingBubble}>
        <TypingDot delay={0} color={Colors.accent} />
        <TypingDot delay={150} color={Colors.secondary} />
        <TypingDot delay={300} color={Colors.accentLight} />
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 11, 20, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  overlayContent: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    shadowColor: Colors.accent,
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    overflow: 'hidden',
    backgroundColor: Colors.primaryLight,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  typingBubble: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: Colors.bubbleAI,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    alignItems: 'center',
  },
});

export default Loader;