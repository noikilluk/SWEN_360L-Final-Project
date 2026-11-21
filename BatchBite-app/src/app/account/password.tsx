import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useFeedback } from '@/components/ui/feedback';
import { Banner } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { errorMessage } from '@/domain/errors';
import { useApp, useRequiredUser } from '@/state/app-provider';
import { homeHrefFor } from '@/state/navigation';

/** Change password. Also shown straight after logging in with a temporary password. */
export default function ChangePasswordScreen() {
  const { forced } = useLocalSearchParams<{ forced?: string }>();
  const user = useRequiredUser();
  const { services, signOut } = useApp();
  const { toast } = useFeedback();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mustChange = forced === '1' || user.mustChangePassword;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await services.auth.changePassword(user.id, current, next, confirm);
      toast('Password changed');
      router.replace(homeHrefFor(user.role));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<ScreenHeader back={!mustChange} title="Change password" />}>
      <View style={styles.body}>
        {mustChange ? (
          <Banner
            tone="info"
            title="Choose a new password"
            message="You logged in with a temporary password. Pick your own to continue."
          />
        ) : null}
        <TextField
          label={mustChange ? 'Temporary password' : 'Current password'}
          value={current}
          onChangeText={setCurrent}
          password
          autoComplete="current-password"
        />
        <TextField label="New password" placeholder="At least 8 Characters" value={next} onChangeText={setNext} password autoComplete="new-password" />
        <TextField label="Confirm new password" value={confirm} onChangeText={setConfirm} password onSubmitEditing={submit} />
        {error ? <Banner tone="danger" title={error} /> : null}
        <Button title="Save password" variant="primary" onPress={submit} loading={busy} />
        {mustChange ? (
          <Button
            title="Log out instead"
            variant="ghost"
            onPress={async () => {
              await signOut();
              router.replace('/sign-in');
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.four },
});
