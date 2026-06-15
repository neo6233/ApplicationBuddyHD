import React from 'react';
import {StyleSheet, ImageBackground, ImageBackgroundProps, StatusBar} from 'react-native';

interface Props extends Omit<ImageBackgroundProps, 'source'> {
  children: React.ReactNode;
}

const GradientBackground: React.FC<Props> = ({children, style, ...props}) => {
  return (
    <ImageBackground
      source={require('../assets/gradient_bg.png')}
      style={[styles.container, style]}
      resizeMode="cover"
      {...props}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
      {children}
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default GradientBackground;
