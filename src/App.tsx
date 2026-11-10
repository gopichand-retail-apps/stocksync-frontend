import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockSyncApp } from './StockSyncApp';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StockSyncApp />
    </QueryClientProvider>
  );
}

export default App;
