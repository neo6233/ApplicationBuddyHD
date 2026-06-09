import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
  ActionSheetIOS,
} from 'react-native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/AppNavigator';
import Colors from '../constants/Colors';
import Strings from '../constants/Strings';
import ChatBubble from '../components/ChatBubble';
import {TypingIndicator} from '../components/Loader';
import Header from '../components/Header';
import useAppDispatch from '../redux/hooks/useAppDispatch';
import useAppSelector from '../redux/hooks/useAppSelector';
import {
  addUserMessage,
  sendMessage,
  clearChatHistory,
  clearError,
} from '../redux/slices/chatSlice';
import {saveProgram} from '../redux/slices/programSlice';
import {Message} from '../models/ChatModel';
import {Program} from '../models/ProgramModel';
import {captureVoiceText, isVoiceSupported, resetVoicePromise} from '../services/voiceService';
import {pickImageFromGallery} from '../services/imagePicker';
import {speak, stopSpeaking} from '../services/ttsService';
import {PROGRAM_CATALOG} from '../data/programCatalog';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Chat'>;
};

import {SafeAreaView} from 'react-native-safe-area-context';

const WelcomeMessage: React.FC<{
  onSuggestionPress: (text: string) => void;
}> = ({onSuggestionPress}) => (
  <View style={styles.welcomeContainer}>
    <View style={styles.welcomeIconBadge}>
      <Text style={styles.welcomeIcon}>A</Text>
    </View>
    <Text style={styles.welcomeTitle}>Hi, I'm ARIA!</Text>
    <Text style={styles.welcomeText}>{Strings.CHAT_WELCOME}</Text>
    <View style={styles.suggestionsRow}>
      {['Find courses', 'Check eligibility', 'Admission help'].map(s => (
        <TouchableOpacity
          key={s}
          style={styles.suggestionChip}
          onPress={() => onSuggestionPress(s)}>
          <Text style={styles.suggestionText}>{s}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

const ChatScreen: React.FC<Props> = () => {
  const dispatch = useAppDispatch();
  const {messages, isTyping, error, hydratedMessageCount} = useAppSelector(s => s.chat);
  const savedPrograms = useAppSelector(s => s.programs.savedPrograms);

  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [userImage, setUserImage] = useState<string | null>(null);
  const lastSpokenAssistantMessageId = useRef<string | null>(null);
  const shouldSpeakNextReplyRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Show welcome message if no history
  const hasWelcomeMessage = messages.length === 0;

  const normalize = (text: string) =>
    text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();

  const isSaveIntent = (text: string) => {
    const normalized = normalize(text);
    return [
      'save this program',
      'save program',
      'save it',
      'add to saved',
      'add this to saved',
      'bookmark',
      'favorite',
      'favourite',
      'store this program',
    ].some(keyword => normalized.includes(keyword));
  };

  const findProgramFromText = (text: string): Program | null => {
    const normalized = normalize(text);
    const match = PROGRAM_CATALOG.find(program => normalized.includes(normalize(program.name)));
    return match ? {...match, matchScore: 0} : null;
  };

  const isProgramSaved = useCallback(
    (program: Program) =>
      savedPrograms.some(
        saved => saved.name === program.name && saved.university === program.university,
      ),
    [savedPrograms],
  );

  const handleSaveProgram = useCallback(
    async (program: Program) => {
      await dispatch(saveProgram(program));
      Alert.alert('Saved!', `${program.name} has been added to your saved programs.`);
    },
    [dispatch],
  );

useEffect(() => {
     if (error) {
       dispatch(clearError());
     }
   }, [error, dispatch]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({animated: true});
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  useEffect(() => {
    const latestAssistantIndex = [...messages]
      .map((m, index) => ({m, index}))
      .reverse()
      .find(entry => entry.m.role === 'assistant' && entry.m.content?.trim())?.index;
    const latestAssistantMessage =
      latestAssistantIndex !== undefined ? messages[latestAssistantIndex] : undefined;

    if (!latestAssistantMessage) {
      lastSpokenAssistantMessageId.current = null;
      return;
    }

    if (!shouldSpeakNextReplyRef.current) {
      lastSpokenAssistantMessageId.current = latestAssistantMessage.id;
      return;
    }

    if (lastSpokenAssistantMessageId.current === latestAssistantMessage.id) {
      return;
    }

    const triggeringUserMessage =
      latestAssistantIndex !== undefined && latestAssistantIndex > 0
        ? [...messages].slice(0, latestAssistantIndex).reverse().find(m => m.role === 'user')
        : undefined;

    if (triggeringUserMessage?.inputMode !== 'voice') {
      lastSpokenAssistantMessageId.current = latestAssistantMessage.id;
      return;
    }

    lastSpokenAssistantMessageId.current = latestAssistantMessage.id;
    shouldSpeakNextReplyRef.current = false;

    void (async () => {
      try {
        await stopSpeaking();
        await speak(latestAssistantMessage.content);
      } catch (error) {
        console.warn('[ChatScreen] TTS failed:', error);
      }
    })();
  }, [messages]);

  const clearPendingImage = useCallback(() => {
    setUserImage(null);
  }, []);

  const handleImageAttach = useCallback(async () => {
    const picked = await pickImageFromGallery();
    if (!picked?.base64) {
      return;
    }
    setUserImage(picked.base64);
  }, []);

  const sendText = useCallback(async (textToSend: string, overrideImage?: string | null) => {
    const text = textToSend.trim();
    if (!text && !userImage && overrideImage === undefined) return;

    const imageToSend = overrideImage !== undefined ? overrideImage : userImage;

    setInputText('');
    setUserImage(null);

    const history = messages;
    const isVoiceOrNoImageSend = overrideImage === null;
    const historyForSend = isVoiceOrNoImageSend
      ? history.map(m => ({...m, image: null}))
      : history;

    dispatch(
      addUserMessage({
        content: text || 'Attached an image',
        image: imageToSend,
        inputMode: overrideImage === null ? 'voice' : 'text',
      }),
    );

    const resultAction = await dispatch(
      sendMessage({
        userMessage: text || 'Attached an image',
        history: historyForSend,
        image: imageToSend,
      }),
    );

    if (sendMessage.fulfilled.match(resultAction)) {
      const payload = resultAction.payload;

      if (isSaveIntent(text)) {
        const programFromReply = payload.programs?.[0] as Program | undefined;
        const programFromText = programFromReply || findProgramFromText(historyForSend.map(m => m.content).join(' ')) || findProgramFromText(text);

        if (programFromText) {
          await dispatch(saveProgram(programFromText));
          Alert.alert('Saved!', `${programFromText.name} has been added to your saved programs.`);
        } else {
          Alert.alert('Save program', 'I could not identify which program to save. Please mention the program name.');
        }
      }
    }
  }, [messages, userImage, dispatch]);

  const handleSend = useCallback(async () => {
    shouldSpeakNextReplyRef.current = false;
    await sendText(inputText);
  }, [inputText, sendText]);

  const handleVoiceInput = useCallback(async () => {
    if (!isVoiceSupported()) {
      Alert.alert('Voice not supported', 'Your device does not support voice input.');
      return;
    }

    resetVoicePromise();
    setInputText('');

    try {
      setIsListening(true);
      shouldSpeakNextReplyRef.current = true;
      const result = await captureVoiceText({
        locale: 'en-IN',
        onTranscript: text => setInputText(text),
      });
      console.log('Voice capture result:', result);

      if (result.error && !result.transcript && !result.error.includes('No speech detected') && !result.error.includes('timeout')) {
        Alert.alert('Voice input', result.error || 'Please try again');
        return;
      }

      const transcript = result.transcript.trim();
      if (!transcript) {
        shouldSpeakNextReplyRef.current = false;
        return;
      }

      setInputText(transcript);
      await sendText(transcript, null);
    } catch (error: any) {
      shouldSpeakNextReplyRef.current = false;
      Alert.alert('Voice input', error?.message || 'Failed to process voice');
    } finally {
      setIsListening(false);
    }
  }, [sendText]);

  const handleClearChat = useCallback(() => {
    Alert.alert(Strings.CHAT_CLEAR, Strings.CHAT_CLEAR_CONFIRM, [
      {text: Strings.BTN_CANCEL, style: 'cancel'},
      {
        text: Strings.BTN_CONFIRM,
        style: 'destructive',
        onPress: () => {
          lastSpokenAssistantMessageId.current = null;
          stopSpeaking();
          dispatch(clearChatHistory());
        },
      },
    ]);
  }, [dispatch]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const renderItem = useCallback(
    ({item}: {item: Message}) => {
      return (
        <ChatBubble
          message={item}
          onSaveProgram={program => handleSaveProgram(program as Program)}
          isProgramSaved={program => isProgramSaved(program as Program)}
        />
      );
    },
    [handleSaveProgram, isProgramSaved],
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <Header
        title={Strings.NAV_CHAT}
        subtitle="Online · AI Admission Counsellor"
        showBack
        rightAction={
          messages.length > 0
            ? {label: 'Clear', onPress: handleClearChat}
            : undefined
        }
      />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            hasWelcomeMessage ? (
              <WelcomeMessage
                onSuggestionPress={text => {
                  setInputText(text);
                  inputRef.current?.focus();
                }}
              />
            ) : null
          }
          ListFooterComponent={
            isTyping ? (
              <View style={styles.typingContainer}>
                <TypingIndicator />
              </View>
            ) : null
          }
          onContentSizeChange={scrollToBottom}
        />

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={isListening ? 'Listening...' : Strings.CHAT_PLACEHOLDER}
            placeholderTextColor={Colors.inputPlaceholder}
            multiline
            maxLength={1000}
            selectionColor={Colors.accent}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[
              styles.voiceButton,
              isListening && styles.voiceButtonActive,
            ]}
            onPress={handleVoiceInput}
            disabled={isListening || isTyping}
            activeOpacity={0.8}>
            <Text
              style={[
                styles.voiceIcon,
                isListening && styles.voiceIconActive,
              ]}>
              {isListening ? '●' : '🎤'}
            </Text>
          </TouchableOpacity>
          {userImage ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={clearPendingImage}
              disabled={isTyping}
              activeOpacity={0.8}>
              <Text style={styles.sendIcon}>✕</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[
              styles.attachButton,
              isTyping && styles.sendButtonDisabled,
            ]}
            onPress={handleImageAttach}
            disabled={isTyping}
            activeOpacity={0.8}>
            <Text style={styles.attachIcon}>🖼️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sendButton,
              ((!inputText.trim() && !userImage) || isTyping) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={(!inputText.trim() && !userImage) || isTyping}
            activeOpacity={0.8}>
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  messageList: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  typingContainer: {
    paddingHorizontal: 0,
  },
  welcomeContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  welcomeIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: Colors.accent,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  welcomeIcon: {
    fontSize: 34,
    fontWeight: '800',
    color: Colors.textInverse,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  welcomeText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  suggestionChip: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  suggestionText: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '500',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.inputBackground,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 15,
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: Colors.inputBorder,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  sendIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  attachIcon: {
    fontSize: 18,
  },
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  voiceButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  voiceIcon: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  voiceIconActive: {
    color: Colors.textInverse,
  },
});

export default ChatScreen;