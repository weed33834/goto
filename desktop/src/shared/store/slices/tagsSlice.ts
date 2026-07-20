// Tags Slice — 标签管理状态
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { Tag } from '../../types';
import {
  createTag as apiCreateTag,
  deleteTag as apiDeleteTag,
  updateTag as apiUpdateTag,
} from '../../api';
import { generateId, initialTags } from '../constants';

export interface TagsSlice {
  tags: Tag[];
  addTag: (tag: Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTag: (id: string, updates: Partial<Tag>) => void;
  deleteTag: (id: string) => void;
  mergeTags: (sourceId: string, targetId: string) => void;
}

export const createTagsSlice: StateCreator<AppStore, [], [], TagsSlice> = (set, get) => ({
  tags: initialTags,

  addTag: (tag) => {
    const id = generateId();
    const newTag: Tag = {
      ...tag,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    set((state) => ({ tags: [...state.tags, newTag] }));
    get().saveData();

    if (get().apiAvailable) {
      apiCreateTag({ ...tag, id })
        .then((created) => {
          set((state) => ({
            tags: state.tags.map((t) => (t.id === id ? created : t)),
          }));
        })
        .catch((error) => console.warn('API create tag failed:', error));
    }

    return id;
  },

  updateTag: (id, updates) => {
    set((state) => ({
      tags: state.tags.map((tag) =>
        tag.id === id ? { ...tag, ...updates, updatedAt: new Date() } : tag
      ),
    }));
    get().saveData();

    if (get().apiAvailable) {
      apiUpdateTag(id, updates).catch((error) =>
        console.warn('API update tag failed:', error),
      );
    }
  },

  deleteTag: (id) => {
    set((state) => ({
      tags: state.tags.filter((tag) => tag.id !== id),
    }));
    get().saveData();

    if (get().apiAvailable) {
      apiDeleteTag(id).catch((error) => console.warn('API delete tag failed:', error));
    }
  },

  mergeTags: (sourceId, targetId) => {
    const tasks = get().tasks;
    tasks.forEach((task) => {
      if (task.tags.includes(sourceId)) {
        const newTags = task.tags.filter((t) => t !== sourceId);
        if (!newTags.includes(targetId)) {
          newTags.push(targetId);
        }
        get().updateTask(task.id, { tags: newTags });
      }
    });
    get().deleteTag(sourceId);
  },
});
