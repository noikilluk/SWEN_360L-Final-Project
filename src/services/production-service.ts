/**
 * Kitchen task assignment (Sprint 2: "production board and kitchen task
 * assignment"). Owners create tasks for a batch and assign them to kitchen
 * staff; staff move them from To do to Done.
 */
import { ensure } from '@/domain/errors';
import { can, requireCapability } from '@/domain/permissions';
import { formatDay } from '@/domain/time';
import type { ID, ProductionTask, TaskStatus } from '@/domain/types';
import { validateRequiredText } from '@/domain/validation';

import { type ServiceContext, loadActor } from './context';
import { notifyUser } from './notification-service';

export interface TaskInput {
  title: string;
  details: string;
  batchId?: ID;
  assigneeId?: ID;
  dueAt?: Date;
}

export class ProductionService {
  constructor(private readonly ctx: ServiceContext) {}

  createTask(actorId: ID, input: TaskInput): Promise<ProductionTask> {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'assignTasks');
      const problem = validateRequiredText(input.title, 'a task title', 80);
      ensure(!problem, 'VALIDATION', problem ?? '');
      ensure(input.details.length <= 300, 'VALIDATION', 'Details can have at most 300 characters.');
      if (input.batchId) tx.require('batches', input.batchId, 'batch');
      if (input.assigneeId) {
        const assignee = tx.require('users', input.assigneeId, 'staff member');
        ensure(assignee.active && can(assignee, 'workOnTasks'), 'VALIDATION', 'Tasks can only go to active kitchen staff or owners.');
      }
      const now = this.ctx.now().toISOString();
      const task = tx.put('tasks', {
        id: this.ctx.crypto.randomId(),
        title: input.title.trim(),
        details: input.details.trim(),
        batchId: input.batchId,
        assigneeId: input.assigneeId,
        status: 'todo',
        dueAt: input.dueAt?.toISOString(),
        createdAt: now,
        createdBy: actorId,
        updatedAt: now,
      });
      if (input.assigneeId && input.assigneeId !== actorId) {
        notifyUser(tx, this.ctx, input.assigneeId, {
          kind: 'task_assigned',
          title: 'New task for you',
          body: `${task.title}${task.dueAt ? ` (due ${formatDay(task.dueAt)})` : ''}`,
          batchId: input.batchId,
        });
      }
      return task;
    });
  }

  /**
   * Creates one task per option for a batch, based on the confirmed orders,
   * for example "Make 8 × Dessert box (Chocolate)".
   */
  generateBatchTasks(actorId: ID, batchId: ID, assigneeId?: ID): Promise<number> {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'assignTasks');
      const batch = tx.require('batches', batchId, 'batch');
      const product = tx.require('products', batch.productId, 'product');
      const totals = new Map<string, number>();
      for (const order of tx.all('orders')) {
        if (!['confirmed', 'preparing'].includes(order.status)) continue;
        for (const item of order.items) {
          if (item.batchId === batchId) totals.set(item.variantName, (totals.get(item.variantName) ?? 0) + item.quantity);
        }
      }
      ensure(totals.size > 0, 'VALIDATION', 'There are no orders waiting for production in this batch.');
      const existingTitles = new Set(tx.all('tasks').filter((t) => t.batchId === batchId).map((t) => t.title));
      const now = this.ctx.now().toISOString();
      let created = 0;
      for (const [variant, quantity] of totals) {
        const title = `Make ${quantity} × ${product.name} (${variant})`;
        if (existingTitles.has(title)) continue;
        tx.put('tasks', {
          id: this.ctx.crypto.randomId(),
          batchId,
          title,
          details: `For collection on ${formatDay(batch.collectionStart)}.`,
          assigneeId,
          status: 'todo',
          dueAt: batch.collectionStart,
          createdAt: now,
          createdBy: actorId,
          updatedAt: now,
        });
        created += 1;
      }
      if (created && assigneeId && assigneeId !== actorId) {
        notifyUser(tx, this.ctx, assigneeId, {
          kind: 'task_assigned',
          title: `${created} new task${created === 1 ? '' : 's'} for you`,
          body: `${product.name} for ${formatDay(batch.collectionStart)}.`,
          batchId,
        });
      }
      ensure(created > 0, 'CONFLICT', 'Tasks for these orders already exist.');
      return created;
    });
  }

  /** Kitchen staff can update their own or unassigned tasks; owners can update any. */
  setTaskStatus(actorId: ID, taskId: ID, status: TaskStatus) {
    return this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      requireCapability(actor, 'workOnTasks');
      const task = tx.require('tasks', taskId, 'task');
      ensure(
        actor.role === 'owner' || !task.assigneeId || task.assigneeId === actorId,
        'FORBIDDEN',
        'This task is assigned to someone else.',
      );
      const now = this.ctx.now().toISOString();
      tx.put('tasks', {
        ...task,
        status,
        // Claim unassigned tasks when someone starts them.
        assigneeId: task.assigneeId ?? (status !== 'todo' ? actorId : undefined),
        updatedAt: now,
        completedAt: status === 'done' ? now : undefined,
      });
    });
  }

  assignTask(actorId: ID, taskId: ID, assigneeId: ID | undefined) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'assignTasks');
      const task = tx.require('tasks', taskId, 'task');
      if (assigneeId) {
        const assignee = tx.require('users', assigneeId, 'staff member');
        ensure(assignee.active && can(assignee, 'workOnTasks'), 'VALIDATION', 'Tasks can only go to active kitchen staff or owners.');
        if (assigneeId !== actorId) {
          notifyUser(tx, this.ctx, assigneeId, { kind: 'task_assigned', title: 'New task for you', body: task.title, batchId: task.batchId });
        }
      }
      tx.put('tasks', { ...task, assigneeId, updatedAt: this.ctx.now().toISOString() });
    });
  }

  deleteTask(actorId: ID, taskId: ID) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'assignTasks');
      tx.require('tasks', taskId, 'task');
      tx.delete('tasks', taskId);
    });
  }
}
