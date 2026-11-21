import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TaskCard } from '@/components/task-list';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { useFeedback } from '@/components/ui/feedback';
import { EmptyState } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { SelectSheet } from '@/components/ui/select-sheet';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { staffMembers } from '@/data/selectors';
import { formatDay } from '@/domain/time';
import type { ID, TaskStatus } from '@/domain/types';
import { useDbState, useRequiredUser, useServices } from '@/state/app-provider';

/** Owner: create kitchen tasks and assign them to staff (Sprint 2). */
export default function TasksScreen() {
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const { toast, confirm, showError } = useFeedback();
  const [filter, setFilter] = useState<'open' | 'done'>('open');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [assigneeId, setAssigneeId] = useState<ID | undefined>();
  const [batchId, setBatchId] = useState<ID | undefined>();
  const [assigning, setAssigning] = useState<ID | null>(null);
  const staff = staffMembers(state);
  const batches = Object.values(state.batches).filter((b) => b.status === 'published');
  const tasks = Object.values(state.tasks)
    .filter((t) => (filter === 'open' ? t.status !== 'done' : t.status === 'done'))
    .sort((a, b) => (a.dueAt ?? a.createdAt).localeCompare(b.dueAt ?? b.createdAt));

  const create = async () => {
    try {
      await services.production.createTask(user.id, { title, details, assigneeId, batchId });
      toast('Task created');
      setTitle('');
      setDetails('');
    } catch (error) {
      showError(error);
    }
  };

  const setStatus = (taskId: ID, status: TaskStatus) => services.production.setTaskStatus(user.id, taskId, status).catch(showError);

  return (
    <Screen header={<ScreenHeader back title="Kitchen tasks" />}>
      <Card>
        <AppText variant="subheading">New task</AppText>
        <TextField placeholder="For example: Bake 24 cupcakes" value={title} onChangeText={setTitle} maxLength={80} />
        <TextField placeholder="Details (optional)" value={details} onChangeText={setDetails} maxLength={300} />
        <AppText variant="label">Assign to</AppText>
        <View style={styles.chips}>
          <Chip label="Anyone" selected={!assigneeId} onPress={() => setAssigneeId(undefined)} />
          {staff.map((s) => (
            <Chip key={s.id} label={s.displayName} selected={assigneeId === s.id} onPress={() => setAssigneeId(s.id)} />
          ))}
        </View>
        {batches.length ? (
          <>
            <AppText variant="label">Batch (optional)</AppText>
            <View style={styles.chips}>
              <Chip label="None" selected={!batchId} onPress={() => setBatchId(undefined)} />
              {batches.map((b) => (
                <Chip key={b.id} label={`${state.products[b.productId]?.name ?? 'Batch'} · ${formatDay(b.collectionStart)}`} selected={batchId === b.id} onPress={() => setBatchId(b.id)} />
              ))}
            </View>
          </>
        ) : null}
        <Button title="Create task" variant="primary" size="sm" icon="plus" onPress={create} disabled={!title.trim()} />
      </Card>

      <View style={styles.chips}>
        <Chip label="Open" selected={filter === 'open'} onPress={() => setFilter('open')} />
        <Chip label="Done" selected={filter === 'done'} onPress={() => setFilter('done')} />
      </View>

      {tasks.length === 0 ? (
        <EmptyState icon="tasks" title={filter === 'open' ? 'No open tasks' : 'No finished tasks'} />
      ) : (
        <View style={styles.list}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              state={state}
              viewer={user}
              onStatus={(status) => setStatus(task.id, status)}
              onAssign={() => setAssigning(task.id)}
              onDelete={async () => {
                const ok = await confirm({ title: 'Delete this task?', confirmLabel: 'Delete', destructive: true });
                if (ok) services.production.deleteTask(user.id, task.id).then(() => toast('Task deleted')).catch(showError);
              }}
            />
          ))}
        </View>
      )}

      {assigning ? (
        <SelectSheet
          title="Assign to"
          options={[{ key: '', label: 'Unassigned' }, ...staff.map((s) => ({ key: s.id, label: s.displayName, detail: s.role === 'owner' ? 'Owner' : 'Kitchen staff' }))]}
          selectedKey={state.tasks[assigning]?.assigneeId ?? ''}
          onClose={() => setAssigning(null)}
          onSelect={(key) => {
            services.production
              .assignTask(user.id, assigning, key || undefined)
              .then(() => toast('Task assigned'))
              .catch(showError);
            setAssigning(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  list: { gap: Spacing.three },
});
