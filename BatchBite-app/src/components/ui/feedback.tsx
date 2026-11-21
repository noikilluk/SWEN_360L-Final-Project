/**
 * Cross-platform confirm and prompt dialogs plus toasts. React Native's
 * `Alert` does not support buttons or text input on the web, so the app uses
 * these instead for every confirmation and error message.
 */
import { createContext, type ReactNode, use, useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type KeyboardTypeOptions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { errorMessage } from '@/domain/errors';

import { Button } from './button';
import { Icon } from './icon';
import { AppText } from './text';
import { TextField } from './text-field';

type ToastTone = 'success' | 'error' | 'info';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PromptOptions extends ConfirmOptions {
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  /** Return an error message to keep the dialog open. */
  validate?: (value: string) => string | null;
}

interface FeedbackApi {
  toast: (message: string, tone?: ToastTone) => void;
  /** Shows the error's user-friendly message. */
  showError: (error: unknown) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

type DialogState =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toastState, setToastState] = useState<{ message: string; tone: ToastTone; id: number } | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToastState({ message, tone, id: Date.now() });
    timer.current = setTimeout(() => setToastState(null), tone === 'error' ? 5000 : 3000);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const api: FeedbackApi = {
    toast,
    showError: (error) => toast(errorMessage(error), 'error'),
    confirm: (options) => new Promise<boolean>((resolve) => setDialog({ kind: 'confirm', options, resolve })),
    prompt: (options) => new Promise<string | null>((resolve) => setDialog({ kind: 'prompt', options, resolve })),
  };

  return (
    <FeedbackContext value={api}>
      {children}
      {dialog ? <Dialog state={dialog} onClose={() => setDialog(null)} /> : null}
      {toastState ? <Toast key={toastState.id} message={toastState.message} tone={toastState.tone} onDismiss={() => setToastState(null)} /> : null}
    </FeedbackContext>
  );
}

export function useFeedback(): FeedbackApi {
  const api = use(FeedbackContext);
  if (!api) throw new Error('useFeedback must be used inside FeedbackProvider');
  return api;
}

function Dialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const { options } = state;
  const [value, setValue] = useState(state.kind === 'prompt' ? (state.options.defaultValue ?? '') : '');
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    if (state.kind === 'confirm') state.resolve(false);
    else state.resolve(null);
    onClose();
  };
  const accept = () => {
    if (state.kind === 'confirm') {
      state.resolve(true);
    } else {
      const problem = state.options.validate?.(value) ?? null;
      if (problem) {
        setError(problem);
        return;
      }
      state.resolve(value);
    }
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={cancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel="Close dialog" />
        <View style={[styles.dialog, Shadow]} accessibilityViewIsModal>
          <AppText variant="heading" accessibilityRole="header">
            {options.title}
          </AppText>
          {options.message ? (
            <AppText variant="body" color="textSecondary">
              {options.message}
            </AppText>
          ) : null}
          {state.kind === 'prompt' ? (
            <TextField
              autoFocus
              value={value}
              onChangeText={(text) => {
                setValue(text);
                setError(null);
              }}
              placeholder={state.options.placeholder}
              multiline={state.options.multiline}
              keyboardType={state.options.keyboardType}
              error={error}
              onSubmitEditing={state.options.multiline ? undefined : accept}
            />
          ) : null}
          <View style={styles.actions}>
            <Button title={options.cancelLabel ?? 'Cancel'} variant="ghost" onPress={cancel} style={styles.action} />
            <Button
              title={options.confirmLabel ?? 'OK'}
              variant={options.destructive ? 'danger' : 'primary'}
              onPress={accept}
              style={styles.action}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Toast({ message, tone, onDismiss }: { message: string; tone: ToastTone; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const palette = tone === 'error' ? styles.toastError : tone === 'info' ? styles.toastInfo : styles.toastSuccess;
  return (
    <View pointerEvents="box-none" style={[styles.toastWrap, { top: insets.top + Spacing.two }]}>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        accessibilityLabel={message}
        style={[styles.toast, palette, Shadow]}>
        <Icon name={tone === 'error' ? 'error' : tone === 'info' ? 'info' : 'checkCircle'} size={20} color={Colors.inverse} />
        <AppText variant="label" color="inverse" style={styles.toastText}>
          {message}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: Spacing.five },
  dialog: {
    backgroundColor: Colors.background,
    borderRadius: Radius.xl,
    padding: Spacing.five,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  action: { flex: 1 },
  toastWrap: { position: 'absolute', left: Spacing.four, right: Spacing.four, alignItems: 'center', zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    maxWidth: 520,
    width: '100%',
  },
  toastText: { flex: 1 },
  toastSuccess: { backgroundColor: '#1F7A52' },
  toastError: { backgroundColor: Colors.danger },
  toastInfo: { backgroundColor: '#2A2A30' },
});
