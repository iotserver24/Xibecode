/**
 * Todo item types for task tracking.
 *
 * @module types/todo
 */

export type TodoStatus = 'pending' | 'in_progress' | 'done';

export interface TodoItem {
  id: string;
  title: string;
  status: TodoStatus;
}

export interface TodoDocument {
  pending: TodoItem[];
  inProgress: TodoItem[];
  done: TodoItem[];
}
