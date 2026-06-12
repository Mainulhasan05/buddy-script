'use client';

import { Provider } from 'react-redux';
import { store } from '@/src/store';
import { injectStore } from '@/src/api/axiosInstance';

// Inject the store into the axios instance to break the circular dependency
injectStore(store);

export default function ReduxProvider({ children }) {
  return <Provider store={store}>{children}</Provider>;
}
