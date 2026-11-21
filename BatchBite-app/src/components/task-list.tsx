import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatDateTime } from '@/domain/time';
import type { ProductionTask, TaskStatus, User } from '@/domain/types';
import type { DbState } from '@/data/schema';

import { Badge, type BadgeTone } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { AppText } from './ui/text';

export const TASK_LABELS: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
const TASK_TONES: Record<TaskStatus, BadgeTone> = { todo: 'neutral', in_progress: 'warning', done: 'success' };

/** One production task with buttons to move it forward. */
export function TaskCard({
  task,
  state,
  viewer,
  onStatus,
  onAssign,
  onDelete,
}: {
  task: ProductionTask;
  state: DbState;
  viewer: User;
  onStatus: (status: TaskStatus) => void;
  onAssign?: () => void;
  onDelete?: () => void;
}) {
  const assignee = task.assigneeId ? state.users[task.assigneeId] : undefined;
  const batch = task.batchId ? state.batches[task.batchId] : undefined;
  const product = batch ? state.products[batch.productId] : undefined;
  const canWork = viewer.role === 'owner' || !task.assigneeId || task.assigneeId === viewer.id;
  return (
    <Card tone={task.status === 'done' ? 'outline' : 'surface'}>
      <View style={styles.row}>
        <AppText variant="bodyStrong" style={[styles.flex, task.status === 'done' && styles.done]}>
          {task.title}
        </AppText>
        <Badge label={TASK_LABELS[task.status]} tone={TASK_TONES[task.status]} />
      </View>
      {task.details ? (
        <AppText variant="caption" color="textSecondary">
          {task.details}
        </AppText>
      ) : null}
      <AppText variant="small" color="textMuted">
        {assignee ? `Assigned to ${assignee.displayName}` : 'Unassigned'}
        {product ? ` · ${product.name}` : ''}
        {task.dueAt ? ` · due ${formatDateTime(task.dueAt)}` : ''}
      </AppText>
      <View style={styles.actions}>
        {canWork && task.status === 'todo' ? <Button title="Start" size="sm" variant="primary" onPress={() => onStatus('in_progress')} /> : null}
        {canWork && task.status === 'in_progress' ? <Button title="Mark done" size="sm" variant="primary" icon="check" onPress={() => onStatus('done')} /> : null}
        {canWork && task.status === 'done' ? <Button title="Reopen" size="sm" variant="ghost" onPress={() => onStatus('todo')} /> : null}
        {onAssign ? <Button title={assignee ? 'Reassign' : 'Assign'} size="sm" onPress={onAssign} /> : null}
        {onDelete ? <Button title="Delete" size="sm" variant="ghost" onPress={onDelete} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  done: { textDecorationLine: 'line-through' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
});
