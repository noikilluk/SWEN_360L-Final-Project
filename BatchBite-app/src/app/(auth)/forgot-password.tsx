import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { errorMessage } from '@/domain/errors';
import { useServices } from '@/state/app-provider';

/**
 * There is no email server in this offline app, so a reset request goes to the
 * administrator, who issues a temporary password.
 */
export default function ForgotPasswordScreen() {
  const services = useServices();
  const [username, setUsername] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await services.auth.requestPasswordReset(username);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<ScreenHeader back title="Forgot password" fallbackHref="/sign-in" />}>
      <View style={styles.body}>
        <AppText variant="body" color="textSecondary">
          Enter your username. The BatchBite administrator will be notified and will give you a temporary
          password. You will choose a new one the next time you log in.
        </AppText>
        {sent ? (
          <Banner
            tone="success"
            title="Request sent"
            message="If that account exists, the administrator has been notified. Ask them for your temporary password."
          />
        ) : (
          <>
            <TextField
              label="Username"
              placeholder="Enter your Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={submit}
            />
            {error ? <Banner tone="danger" title={error} /> : null}
            <Button title="Send request" variant="primary" onPress={submit} loading={busy} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.four },
});
