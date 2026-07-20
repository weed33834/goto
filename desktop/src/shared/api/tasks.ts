import type { Task } from '../types';
import { API_ENDPOINTS } from './config';
import { del, get, patch, post } from './client';
import { camelToSnake, convertResponse } from './transform';

export async function fetchTasks(): Promise<Task[]> {
  const raw = await get<unknown[]>(API_ENDPOINTS.tasks);
  return raw.map((v) => convertResponse<Task>(v));
}

export async function fetchTask(id: string): Promise<Task> {
  const raw = await get<unknown>(`${API_ENDPOINTS.tasks}/${id}`);
  return convertResponse<Task>(raw);
}

export async function createTask(task: Omit<Task, 'createdAt' | 'updatedAt'>): Promise<Task> {
  const body = camelToSnake(task);
  const raw = await post<unknown>(API_ENDPOINTS.tasks, body);
  return convertResponse<Task>(raw);
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const body = camelToSnake(updates);
  const raw = await patch<unknown>(`${API_ENDPOINTS.tasks}/${id}`, body);
  return convertResponse<Task>(raw);
}

export async function deleteTask(id: string): Promise<void> {
  return del(`${API_ENDPOINTS.tasks}/${id}`);
}
