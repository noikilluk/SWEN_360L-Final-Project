import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HeaderActions } from '@/components/header-actions';
import { TaskCard } from '@/components/task-list';
import { Chip } from '@/components/ui/chip';
import { useFeedback } from '@/components/ui/feedback';
import { EmptyState, SectionTitle } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import type { TaskStatus } from '@/domain/types';
import { useDbState, useRequiredUser, useServices } from '@/state/app-provider';

/** Kitchen staff task list: their own tasks plus unassigned ones they can pick up. */
export default function KitchenTasks() {
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const { toast, showError } = useFeedback();
  const [showDone, setShowDone] = useState(false);

  const tasks = Object.values(state.tasks).sort((a, b) => (a.dueAt ?? a.createdAt).localeCompare(b.dueAt ?? b.createdAt));
  const mine = tasks.filter((t) => t.assigneeId === user.id && (showDone ? t.status === 'done' : t.status !== 'done'));
  const open = tasks.filter((t) => !t.assigneeId && t.status !== 'done');

  const setStatus = async (taskId: string, status: TaskStatus) => {
    try {
      await services.production.setTaskStatus(user.id, taskId, status);
      toast(status === 'done' ? 'Task done' : status === 'in_progress' ? 'Task started' : 'Task reopened');
    } catch (error) {
      showError(error);
    }
  };

  return (
    <Screen inTabs header={<ScreenHeader title="My tasks" right={<HeaderActions />} />}>
      <View style={styles.tabs}>
        <Chip label="Open" selected={!showDone} onPress={() => setShowDone(false)} />
        <Chip label="Done" selected={showDone} onPress={() => setShowDone(true)} />
      </View>
      {mine.length === 0 ? (
        <EmptyState icon="tasks" title={showDone ? 'Nothing finished yet' : 'No tasks assigned to you'} message={showDone ? undefined : 'The owner assigns production tasks here.'} />
      ) : (
        <View style={styles.list}>
          {mine.map((task) => (
            <TaskCard key={task.id} task={task} state={state} viewer={user} onStatus={(status) => setStatus(task.id, status)} />
          ))}
        </View>
      )}
      {!showDone && open.length ? (
        <View style={styles.list}>
          <SectionTitle title="Unassigned" />
          {open.map((task) => (
            <TaskCard key={task.id} task={task} state={state} viewer={user} onStatus={(status) => setStatus(task.id, status)} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: Spacing.two },
  list: { gap: Spacing.three },
});
