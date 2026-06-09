import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import SplashScreen from '../screens/SplashScreen';
import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import ProgramFinderScreen from '../screens/ProgramFinderScreen';
import EligibilityScreen from '../screens/EligibilityScreen';
import ProfileScreen from '../screens/ProfileScreen';
import Colors from '../constants/Colors';

export type RootStackParamList = {
  Splash: undefined;
  Home: undefined;
  Chat: undefined;
  ProgramFinder: undefined;
  Eligibility: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          contentStyle: {backgroundColor: Colors.background},
          animation: 'fade_from_bottom',
        }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="ProgramFinder" component={ProgramFinderScreen} />
        <Stack.Screen name="Eligibility" component={EligibilityScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;