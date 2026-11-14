import { router } from 'expo-router';
import { View } from 'react-native';

import { ProfileScreen } from '@/components/profile-screen';
import { Divider, ListRow, SectionTitle } from '@/components/ui/misc';
import { pendingChangeRequests } from '@/data/selectors';
import { isLowStock } from '@/domain/recipe';
import { useDbState } from '@/state/app-provider';

/** Owner tools that do not need their own tab, plus the profile. */
export default function OwnerMore() {
  const state = useDbState();
  const pending = pendingChangeRequests(state).length;
  const low = Object.values(state.ingredients).filter(isLowStock).length;
  const openTasks = Object.values(state.tasks).filter((t) => t.status !== 'done').length;
  return (
    <ProfileScreen>
      <View>
        <SectionTitle title="Kitchen and operations" />
        <ListRow icon="kitchen" title="Production board" subtitle="Move orders from To do to Ready" onPress={() => router.push('/manage/board')} />
        <Divider />
        <ListRow icon="scan" title="Verify pickup" subtitle="Scan a customer's QR code" onPress={() => router.push('/manage/scan')} />
        <Divider />
        <ListRow icon="tasks" title="Kitchen tasks" subtitle="Assign work to kitchen staff" badge={openTasks} onPress={() => router.push('/manage/tasks')} />
        <Divider />
        <ListRow icon="edit" title="Change requests" subtitle="Order changes, cancellations and refunds" badge={pending} onPress={() => router.push('/manage/requests')} />
        <Divider />
        <ListRow icon="ingredients" title="Ingredients and stock" subtitle="Stock levels, reservations and shopping list" badge={low} onPress={() => router.push('/manage/ingredients')} />
        <Divider />
        <ListRow icon="clock" title="Pickup slots" subtitle="Collection windows and order limits" onPress={() => router.push('/manage/slots')} />
      </View>
    </ProfileScreen>
  );
}
