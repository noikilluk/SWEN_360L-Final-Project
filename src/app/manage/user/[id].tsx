import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { useFeedback } from '@/components/ui/feedback';
import { Banner, EmptyState, KeyValue, SwitchRow } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { formatDateTime } from '@/domain/time';
import { ROLE_LABELS, USER_ROLES, type UserRole } from '@/domain/types';
import { useDbState, useRequiredUser, useServices } from '@/state/app-provider';

/** Administrator: create a staff account or change an account's role and status. */
export default function UserEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const admin = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const { toast, confirm, showError } = useFeedback();
  const existing = id !== 'new' ? state.users[id] : undefined;
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(existing?.role ?? 'kitchen');
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (id !== 'new' && !existing) {
    return (
      <Screen header={<ScreenHeader back />}>
        <EmptyState icon="users" title="Account not found" />
      </Screen>
    );
  }

  const save = async () => {
    setBusy(true);
    try {
      if (existing) {
        await services.admin.updateUser(admin.id, existing.id, { displayName, role });
        toast('Account updated');
      } else {
        await services.admin.createUser(admin.id, { username, displayName, role, password });
        toast('Account created. They choose their own password on first log in.');
      }
      router.back();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const orderCount = existing ? Object.values(state.orders).filter((o) => o.customerId === existing.id).length : 0;

  return (
    <Screen
      header={<ScreenHeader back title={existing ? existing.displayName : 'New staff account'} subtitle={existing ? `@${existing.username}` : undefined} />}
      footer={<Button title={existing ? 'Save changes' : 'Create account'} variant="primary" onPress={save} loading={busy} />}>
      {issued ? (
        <Card tone="success">
          <AppText variant="subheading">Temporary password</AppText>
          <AppText variant="mono" selectable style={styles.password}>
            {issued}
          </AppText>
          <AppText variant="caption">Shown only once. They must change it when they log in.</AppText>
        </Card>
      ) : null}

      {!existing ? (
        <>
          <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} helper="3 to 20 letters, numbers, dots or underscores." />
          <TextField label="Temporary password" value={password} onChangeText={setPassword} password helper="At least 8 characters. They will be asked to change it." />
        </>
      ) : null}
      <TextField label="Name" value={displayName} onChangeText={setDisplayName} maxLength={40} />

      <View style={styles.section}>
        <AppText variant="label">Role</AppText>
        <View style={styles.chips}>
          {USER_ROLES.map((r) => (
            <Chip key={r} label={ROLE_LABELS[r]} selected={role === r} onPress={() => setRole(r)} disabled={existing?.id === admin.id && r !== 'admin'} />
          ))}
        </View>
        <AppText variant="caption" color="textSecondary">
          {role === 'customer' && 'Browses batches, orders and tracks pickups.'}
          {role === 'owner' && 'Manages products, batches, stock, orders, refunds and insights.'}
          {role === 'kitchen' && 'Works the production board, tasks and pickup verification.'}
          {role === 'admin' && 'Manages accounts and system settings.'}
        </AppText>
      </View>

      {existing ? (
        <>
          <Card>
            <KeyValue label="Created" value={formatDateTime(existing.createdAt)} />
            {existing.role === 'customer' ? <KeyValue label="Orders" value={String(orderCount)} /> : null}
            <SwitchRow
              title="Account active"
              subtitle={existing.id === admin.id ? 'You cannot deactivate yourself' : 'Deactivated accounts cannot log in'}
              value={existing.active}
              disabled={existing.id === admin.id}
              onValueChange={(active) =>
                services.admin
                  .updateUser(admin.id, existing.id, { active })
                  .then(() => toast(active ? 'Account reactivated' : 'Account deactivated'))
                  .catch(showError)
              }
            />
          </Card>
          <Button
            title="Reset password"
            icon="key"
            onPress={async () => {
              const ok = await confirm({ title: `Reset @${existing.username}'s password?`, confirmLabel: 'Reset' });
              if (!ok) return;
              try {
                setIssued(await services.admin.issueTemporaryPassword(admin.id, existing.id));
              } catch (error) {
                showError(error);
              }
            }}
          />
          {existing.id === admin.id ? <Banner tone="info" title="This is your account" message="Ask another administrator to change your role." /> : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  password: { fontSize: 22, letterSpacing: 2 },
});
