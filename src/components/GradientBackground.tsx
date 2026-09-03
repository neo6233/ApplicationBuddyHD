import React from 'react';
import {StyleSheet, StatusBar, View, ViewStyle} from 'react-native';
import Colors from '../constants/Colors';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

const GradientBackground: React.FC<Props> = ({children, style}) => {
  return (
    <View style={[styles.container, style]}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
      <View style={styles.softGlow} />
      <View style={styles.softGlowTwo} />
      <View style={styles.softGlowThree} />
      <View style={styles.overlay} />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FC',
    overflow: 'hidden',
  },
  softGlow: {
    position: 'absolute',
    top: -60,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(237, 233, 254, 0.72)',
  },
  softGlowTwo: {
    position: 'absolute',
    top: '22%',
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(219, 234, 254, 0.58)',
  },
  softGlowThree: {
    position: 'absolute',
    bottom: -80,
    left: '18%',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
});

export default GradientBackground;
