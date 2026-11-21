import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { HeaderActions } from '@/components/header-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { useFeedback } from '@/components/ui/feedback';
import { SectionTitle } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { formatAgo } from '@/domain/time';
import { ROLE_LABELS, USER_ROLES, type UserRole } from '@/domain/types';
import { useDbState, useNow, useRequiredUser, useServices } from '@/state/app-provider';

/** Administrator: all accounts and password reset requests. */
export default function AdminUsers() {
  const admin = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const now = useNow();
  const { confirm, showError } = useFeedback();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);

  const resets = Object.values(state.resetRequests).filter((r) => r.status === 'pending');
  const users = Object.values(state.users)
    .filter((u) => role === 'all' || u.role === role)
    .filter((u) => `${u.username} ${u.displayName}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.role.localeCompare(b.role) || a.username.localeCompare(b.username));

  const issueTemporary = async (userId: string, username: string) => {
    const ok = await confirm({ title: `Reset ${username}'s password?`, message: 'A temporary password is created. They must choose a new one when they log in.', confirmLabel: 'Reset password' });
    if (!ok) return;
    try {
      const password = await services.admin.issueTemporaryPassword(admin.id, userId);
      setIssued({ username, password });
    } catch (error) {
      showError(error);
    }
  };

  return (
    <Screen
      inTabs
      header={<ScreenHeader title="Users" subtitle={`${Object.keys(state.users).length} accounts`} right={<HeaderActions />} />}
      footer={<Button title="Add staff account" variant="primary" icon="addUser" onPress={() => router.push({ pathname: '/manage/user/[id]', params: { id: 'new' } })} />}>
      {issued ? (
        <Card tone="success">
          <AppText variant="subheading">Temporary password for @{issued.username}</AppText>
          <AppText variant="mono" selectable style={styles.password}>
            {issued.password}
          </AppText>
          <AppText variant="caption">Give this to the user in person. It is shown only once.</AppText>
          <Button title="Done" size="sm" onPress={() => setIssued(null)} />
        </Card>
      ) : null}

      {resets.length ? (
        <View style={styles.section}>
          <SectionTitle title="Password reset requests" />
          {resets.map((request) => (
            <Card key={request.id} tone="warning">
              <AppText variant="bodyStrong">@{request.username}</AppText>
              <AppText variant="caption">Asked {formatAgo(request.createdAt, now)}</AppText>
              <View style={styles.actions}>
                <Button title="Issue temporary password" size="sm" variant="primary" onPress={() => issueTemporary(request.userId, request.username)} />
                <Button title="Dismiss" size="sm" variant="ghost" onPress={() => services.admin.dismissResetRequest(admin.id, request.id).catch(showError)} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <TextField placeholder="Search by name or username" value={query} onChangeText={setQuery} autoCapitalize="none" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All" selected={role === 'all'} onPress={() => setRole('all')} />
        {USER_ROLES.map((r) => (
          <Chip key={r} label={ROLE_LABELS[r]} selected={role === r} onPress={() => setRole(r)} />
        ))}
      </ScrollView>

      <View style={styles.list}>
        {users.map((user) => (
          <Card key={user.id} onPress={() => router.push({ pathname: '/manage/user/[id]', params: { id: user.id } })}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{user.displayName}</AppText>
                <AppText variant="caption" color="textSecondary">
                  @{user.username}
                  {user.id === admin.id ? ' · you' : ''}
                </AppText>
              </View>
              <Badge label={ROLE_LABELS[user.role]} tone={user.role === 'customer' ? 'neutral' : 'primary'} />
            </View>
            {!user.active || user.mustChangePassword ? (
              <View style={styles.actions}>
                {!user.active ? <Badge label="Deactivated" tone="danger" /> : null}
                {user.mustChangePassword ? <Badge label="Must change password" tone="warning" /> : null}
              </View>
            ) : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three },
  chips: { gap: Spacing.two, paddingRight: Spacing.four },
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  password: { fontSize: 22, letterSpacing: 2 },
});
