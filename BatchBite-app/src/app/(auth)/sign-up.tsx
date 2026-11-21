import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/misc';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { errorMessage } from '@/domain/errors';
import { validatePassword, validatePasswordConfirmation, validateUsername } from '@/domain/validation';
import { useApp } from '@/state/app-provider';

/** Sign up screen (wireframe 5.2). New accounts are customers. */
export default function SignUpScreen() {
  const { services, signIn } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usernameError = touched ? validateUsername(username) : null;
  const passwordError = touched ? validatePassword(password) : null;
  const confirmError = touched ? validatePasswordConfirmation(password, confirm) : null;

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (validateUsername(username) || validatePassword(password) || validatePasswordConfirmation(password, confirm)) return;
    setBusy(true);
    try {
      const user = await services.auth.signUp({ username, password, confirmPassword: confirm });
      await signIn(user);
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <AppText variant="caption" align="center">
            Already have an account?
          </AppText>
          <Button title="Log in" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))} />
        </View>
      }>
      <View style={styles.top}>
        <Logo />
        <View style={styles.greeting}>
          <AppText variant="heading">Create your account</AppText>
          <AppText variant="body">Order ahead and track your pickup.</AppText>
        </View>
        <TextField
          label="Username"
          placeholder="Choose a Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          error={usernameError}
          helper="3 to 20 letters, numbers, dots or underscores."
        />
        <TextField
          label="Password"
          placeholder="At least 8 Characters"
          value={password}
          onChangeText={setPassword}
          password
          autoComplete="new-password"
          textContentType="newPassword"
          error={passwordError}
        />
        <TextField
          label="Confirm Password"
          placeholder="Re-enter your Password"
          value={confirm}
          onChangeText={setConfirm}
          password
          autoComplete="new-password"
          error={confirmError}
          onSubmitEditing={submit}
        />
        {error ? <Banner tone="danger" title={error} /> : null}
        <Button title="Sign Up" onPress={submit} loading={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: Spacing.four, paddingTop: Spacing.five },
  greeting: { gap: Spacing.one, marginTop: Spacing.two },
  footer: { gap: Spacing.two },
});
