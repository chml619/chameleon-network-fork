/**
 * Create new wallet screen
 * Matches mockup design: chmlwallet-mockup-004.jpg to 007.jpg
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/context/WalletContext';
import { walletService } from '@/services/wallet';
import { THEME, GRADIENTS } from '@/constants/theme';

type Step = 'name' | 'phrase' | 'verify';

export default function CreateWalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createWallet, isLoading } = useWallet();
  
  const [step, setStep] = useState<Step>('name');
  const [walletName, setWalletName] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [shuffledWords, setShuffledWords] = useState<string[]>([]);

  const handleContinueToPhrase = async () => {
    if (!walletName.trim()) {
      Alert.alert('Error', 'Please enter a wallet name');
      return;
    }
    if (!isConfirmed) {
      Alert.alert('Error', 'Please confirm you understand the importance of the recovery phrase');
      return;
    }
    
    try {
      // Ensure crypto is ready before generating mnemonic
      await walletService.ensureCryptoReady();
      
      // Generate mnemonic
      const newMnemonic = walletService.generateMnemonic();
      setMnemonic(newMnemonic);
      setStep('phrase');
    } catch (error) {
      console.error('Error generating mnemonic:', error);
      Alert.alert('Error', 'Failed to generate recovery phrase. Please try again.');
    }
  };

  const handleSavedPhrase = () => {
    // Shuffle words for verification
    const words = mnemonic.split(' ');
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setShuffledWords(shuffled);
    setSelectedWords([]);
    setStep('verify');
  };

  const handleWordSelect = (word: string) => {
    if (selectedWords.includes(word)) {
      setSelectedWords(selectedWords.filter(w => w !== word));
    } else {
      setSelectedWords([...selectedWords, word]);
    }
  };

  const handleCopyMnemonic = async () => {
    await Clipboard.setStringAsync(mnemonic);
    Alert.alert('Copied!', 'Seed phrase copied to clipboard');
  };

  const handleCreateWallet = async () => {
    const originalWords = mnemonic.split(' ');
    const isCorrectOrder = selectedWords.every((word, index) => word === originalWords[index]);
    
    if (!isCorrectOrder || selectedWords.length !== 12) {
      Alert.alert('Incorrect Order', 'Please select the words in the correct order.');
      return;
    }

    try {
      await createWallet(mnemonic, walletName.trim());
      Alert.alert(
        'Wallet Created!',
        'Your wallet has been created successfully.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)'),
          },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to create wallet. Please try again.');
    }
  };

  const renderNameStep = () => (
    <>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="Master key name"
          placeholderTextColor={THEME.colors.textMuted}
          value={walletName}
          onChangeText={setWalletName}
          autoFocus
        />
      </View>

      <Text style={styles.infoText}>
        The next screen will show you a 12-word recovery phrase. This phrase is the{' '}
        <Text style={styles.boldText}>only way</Text> to restore your wallet.
      </Text>

      <Text style={styles.infoText}>
        Write it down and store it safely. Anyone with access to the recovery phrase can control your funds.
      </Text>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setIsConfirmed(!isConfirmed)}
      >
        <View style={[styles.checkbox, isConfirmed && styles.checkboxChecked]}>
          {isConfirmed && <Ionicons name="checkmark" size={16} color={THEME.colors.white} />}
        </View>
        <Text style={styles.checkboxText}>
          I understand that losing this phrase means losing access to my wallet.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          (!walletName.trim() || !isConfirmed) && styles.buttonDisabled,
        ]}
        onPress={handleContinueToPhrase}
        disabled={!walletName.trim() || !isConfirmed}
      >
        <Text style={styles.primaryButtonText}>Continue</Text>
      </TouchableOpacity>
    </>
  );

  const renderPhraseStep = () => {
    const words = mnemonic.split(' ');
    
    return (
      <>
        <Text style={styles.phraseInstruction}>
          Save these words in the correct order.{"\n"}
          Never share this phrase with anyone else.
        </Text>

        <View style={styles.phraseGrid}>
          {words.map((word, index) => (
            <View key={index} style={styles.wordCard}>
              <Text style={styles.wordNumber}>{index + 1}</Text>
              <Text style={styles.wordText}>{word}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.copyButton} onPress={handleCopyMnemonic}>
          <Text style={styles.copyButtonText}>Copy</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryButton} onPress={handleSavedPhrase}>
          <Text style={styles.primaryButtonText}>I've saved my phrase</Text>
        </TouchableOpacity>
      </>
    );
  };

  const renderVerifyStep = () => {
    const originalWords = mnemonic.split(' ');
    
    return (
      <>
        <Text style={styles.verifyInstruction}>
          Tap on these words in the correct order.
        </Text>

        <View style={styles.shuffledGrid}>
          {shuffledWords.map((word, index) => {
            const isSelected = selectedWords.includes(word);
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.shuffledWord,
                  isSelected && styles.shuffledWordSelected,
                ]}
                onPress={() => handleWordSelect(word)}
              >
                <Text
                  style={[
                    styles.shuffledWordText,
                    isSelected && styles.shuffledWordTextSelected,
                  ]}
                >
                  {word}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.selectedWordsContainer}>
          <Text style={styles.selectedWordsText}>
            {selectedWords.join(' ')}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (selectedWords.length !== 12 || isLoading) && styles.buttonDisabled,
          ]}
          onPress={handleCreateWallet}
          disabled={selectedWords.length !== 12 || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={THEME.colors.white} />
          ) : (
            <Text style={styles.primaryButtonText}>Create master key</Text>
          )}
        </TouchableOpacity>
      </>
    );
  };

  const getHeaderTitle = () => {
    switch (step) {
      case 'name': return 'Master key name';
      case 'phrase': return 'Master key phrase';
      case 'verify': return 'Verify passphrase';
    }
  };

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (step === 'name') router.back();
            else if (step === 'phrase') setStep('name');
            else setStep('phrase');
          }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {step === 'name' && renderNameStep()}
        {step === 'phrase' && renderPhraseStep()}
        {step === 'verify' && renderVerifyStep()}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },
  backButton: {
    padding: THEME.spacing.xs,
  },
  headerTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: THEME.spacing.lg,
    paddingBottom: THEME.spacing.xl * 2,
  },
  // Name Step
  inputContainer: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    marginBottom: THEME.spacing.xl,
    ...THEME.shadows.small,
  },
  textInput: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.text,
    padding: THEME.spacing.md,
  },
  infoText: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.text,
    lineHeight: 24,
    marginBottom: THEME.spacing.md,
  },
  boldText: {
    fontWeight: THEME.fontWeight.bold,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: THEME.spacing.lg,
    marginBottom: THEME.spacing.xl,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: THEME.colors.primary,
    marginRight: THEME.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: THEME.colors.primary,
  },
  checkboxText: {
    flex: 1,
    fontSize: THEME.fontSize.base,
    color: THEME.colors.text,
    lineHeight: 22,
  },
  // Phrase Step
  phraseInstruction: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.lg,
    lineHeight: 24,
  },
  phraseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: THEME.spacing.lg,
  },
  wordCard: {
    width: '33.33%',
    padding: THEME.spacing.xs,
  },
  wordNumber: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    marginBottom: 2,
  },
  wordText: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.medium,
    color: THEME.colors.text,
    backgroundColor: THEME.colors.white,
    padding: THEME.spacing.sm,
    borderRadius: THEME.borderRadius.small,
    textAlign: 'center',
    overflow: 'hidden',
  },
  copyButton: {
    borderWidth: 2,
    borderColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.xl,
    alignSelf: 'center',
    marginBottom: THEME.spacing.lg,
  },
  copyButtonText: {
    color: THEME.colors.primary,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
  },
  // Verify Step
  verifyInstruction: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.lg,
  },
  shuffledGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.lg,
  },
  shuffledWord: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.small,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  shuffledWordSelected: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  shuffledWordText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.text,
  },
  shuffledWordTextSelected: {
    color: THEME.colors.white,
  },
  selectedWordsContainer: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.xl,
    minHeight: 80,
    ...THEME.shadows.small,
  },
  selectedWordsText: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.text,
    lineHeight: 24,
  },
  // Buttons
  primaryButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    alignItems: 'center',
    marginTop: THEME.spacing.md,
  },
  primaryButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  buttonDisabled: {
    backgroundColor: THEME.colors.lightGrey,
  },
});
