import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rssService } from '@/services/rss-service';
import { RSSFeed, RSSSettings } from '@/types';

export function useRSSNews() {
  return useQuery({
    queryKey: ['rss-news'],
    queryFn: () => rssService.getNews(),
    staleTime: 5 * 60 * 1000, // 5 minutes client-side stale time
    refetchInterval: 15 * 60 * 1000, // Refetch every 15 minutes
  });
}

export function useRSSFeeds() {
  return useQuery({
    queryKey: ['rss-feeds'],
    queryFn: () => rssService.getFeeds(),
  });
}

export function useRSSSettings() {
  return useQuery({
    queryKey: ['rss-settings'],
    queryFn: () => rssService.getSettings(),
  });
}

export function useAddRSSFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (feed: Omit<RSSFeed, 'id' | 'created_at' | 'updated_at'>) => rssService.addFeed(feed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rss-feeds'] });
      queryClient.invalidateQueries({ queryKey: ['rss-news'] });
    },
  });
}

export function useUpdateRSSFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, feed }: { id: string; feed: Partial<RSSFeed> }) => rssService.updateFeed(id, feed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rss-feeds'] });
      queryClient.invalidateQueries({ queryKey: ['rss-news'] });
    },
  });
}

export function useDeleteRSSFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rssService.deleteFeed(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rss-feeds'] });
      queryClient.invalidateQueries({ queryKey: ['rss-news'] });
    },
  });
}

export function useUpdateRSSSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, settings }: { id: string; settings: Partial<RSSSettings> }) => rssService.updateSettings(id, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rss-settings'] });
      queryClient.invalidateQueries({ queryKey: ['rss-news'] });
    },
  });
}
