import { useEffect, useState } from 'react';

type Initializer<T> = () => T;

type Serializer<T> = {
  serialize: (value: T) => string;
  deserialize: (value: string) => T;
};

const defaultSerializer: Serializer<unknown> = {
  serialize: (value) => JSON.stringify(value),
  deserialize: (value) => JSON.parse(value),
};

export function usePersistentState<T>(
  key: string,
  defaultValue: T | Initializer<T>,
  serializer: Serializer<T> = defaultSerializer as Serializer<T>
): [T, (value: T) => void] {
  const initializer = () => {
    if (typeof window === 'undefined') {
      return typeof defaultValue === 'function'
        ? (defaultValue as Initializer<T>)()
        : defaultValue;
    }
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return typeof defaultValue === 'function'
        ? (defaultValue as Initializer<T>)()
        : defaultValue;
    }
    try {
      return serializer.deserialize(raw);
    } catch (error) {
      console.warn(`Failed to parse persisted value for ${key}`, error);
      return typeof defaultValue === 'function'
        ? (defaultValue as Initializer<T>)()
        : defaultValue;
    }
  };

  const [state, setState] = useState<T>(initializer);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(key, serializer.serialize(state));
    } catch (error) {
      console.warn(`Failed to persist state for ${key}`, error);
    }
  }, [key, serializer, state]);

  return [state, setState];
}
