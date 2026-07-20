// Categories Slice — 分类管理状态
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { Category } from '../../types';
import {
  createCategory as apiCreateCategory,
  deleteCategory as apiDeleteCategory,
  updateCategory as apiUpdateCategory,
} from '../../api';
import { generateId, initialCategories } from '../constants';

export interface CategoriesSlice {
  categories: Category[];
  selectedCategory: string | null;
  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  setSelectedCategory: (id: string | null) => void;
  reorderCategories: (categories: Category[]) => void;
}

export const createCategoriesSlice: StateCreator<AppStore, [], [], CategoriesSlice> = (set, get) => ({
  categories: initialCategories,
  selectedCategory: null,

  addCategory: (category) => {
    const id = generateId();
    const newCategory: Category = {
      ...category,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    set((state) => ({ categories: [...state.categories, newCategory] }));
    get().saveData();

    if (get().apiAvailable) {
      apiCreateCategory({ ...category, id })
        .then((created) => {
          set((state) => ({
            categories: state.categories.map((c) => (c.id === id ? created : c)),
          }));
        })
        .catch((error) => console.warn('API create category failed:', error));
    }

    return id;
  },

  updateCategory: (id, updates) => {
    set((state) => ({
      categories: state.categories.map((category) =>
        category.id === id ? { ...category, ...updates, updatedAt: new Date() } : category
      ),
    }));
    get().saveData();

    if (get().apiAvailable) {
      apiUpdateCategory(id, updates).catch((error) =>
        console.warn('API update category failed:', error),
      );
    }
  },

  deleteCategory: (id) => {
    set((state) => ({
      categories: state.categories.filter((category) => category.id !== id),
      selectedCategory: state.selectedCategory === id ? null : state.selectedCategory,
    }));
    get().saveData();

    if (get().apiAvailable) {
      apiDeleteCategory(id).catch((error) =>
        console.warn('API delete category failed:', error),
      );
    }
  },

  setSelectedCategory: (id) => set({ selectedCategory: id }),

  reorderCategories: (categories) => {
    set({ categories: categories.map((cat, index) => ({ ...cat, order: index })) });
    get().saveData();
  },
});
