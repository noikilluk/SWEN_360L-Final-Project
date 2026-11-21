import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Collapsible } from '@/components/ui/collapsible';
import { Banner } from '@/components/ui/misc';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/data/seed';
import { errorMessage } from '@/domain/errors';
import { ROLE_LABELS } from '@/domain/types';
import { useApp, useDbState } from '@/state/app-provider';

/** Log in screen (wireframe 5.1). */
export default function SignInScreen() {
  const { services, signIn, recoveredKeys } = useApp();
  const { settings } = useDbState();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const user = await services.auth.logIn(username, password);
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
            Don&apos;t have an account?
          </AppText>
          <Button title="Create one" onPress={() => router.push('/sign-up')} />
        </View>
      }>
      <View style={styles.top}>
        <Logo />
        {recoveredKeys.length ? (
          <Banner
            tone="warning"
            title="Some saved data could not be read"
            message="It was reset so the app could start. A copy was kept on this device."
          />
        ) : null}
        <View style={styles.greeting}>
          <AppText variant="title">Welcome back,</AppText>
          <AppText variant="body">Log in to order from this week&apos;s batches.</AppText>
        </View>
        <TextField
          label="Username"
          placeholder="Enter your Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          placeholder="Enter your Password"
          value={password}
          onChangeText={setPassword}
          password
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {error ? <Banner tone="danger" title={error} /> : null}
        <Button title="Log in" onPress={submit} loading={busy} testID="login-button" />
        <Link href="/forgot-password" asChild>
          <Pressable accessibilityRole="link" style={styles.forgot} hitSlop={8}>
            <AppText variant="caption" color="infoText">
              forgot password?
            </AppText>
          </Pressable>
        </Link>

        {settings.showDemoAccounts ? (
          <Collapsible title="Demo accounts (sample data)">
            <AppText variant="caption" color="textSecondary">
              Tap a role to fill in its details. Every demo password is &quot;{DEMO_PASSWORD}&quot;.
            </AppText>
            <View style={styles.demoRow}>
              {DEMO_ACCOUNTS.map((account) => (
                <Chip
                  key={account.username}
                  label={ROLE_LABELS[account.role]}
                  selected={username === account.username}
                  onPress={() => {
                    setUsername(account.username);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}
                />
              ))}
            </View>
          </Collapsible>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: Spacing.four, paddingTop: Spacing.five },
  greeting: { gap: Spacing.one, marginTop: Spacing.three },
  forgot: { alignSelf: 'center' },
  footer: { gap: Spacing.two },
  demoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
