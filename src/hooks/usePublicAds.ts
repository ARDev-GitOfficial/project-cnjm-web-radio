import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { buildAdRotation, fetchPublicAds, getVisibleAds, type SiteAd } from "../lib/ads";

export function usePublicAds(selectAd?: (ad: SiteAd) => boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["public-ads"],
    queryFn: ({ signal }) => fetchPublicAds(signal),
    staleTime: 1_800_000,
    gcTime: 3_600_000,
    refetchInterval: 1_800_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const reload = () => {
      void queryClient.invalidateQueries({ queryKey: ["public-ads"] });
    };

    window.addEventListener("storage", reload);
    window.addEventListener("cnjm-ads-updated", reload);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("cnjm-ads-updated", reload);
    };
  }, [queryClient]);

  const ads = useMemo(() => {
    if (!query.data) return [];
    const visibleAds = getVisibleAds(query.data.ads, query.data.settings);
    const selectedAds = selectAd ? visibleAds.filter(selectAd) : visibleAds;
    return buildAdRotation(selectedAds, query.data.settings);
  }, [query.data, selectAd]);

  return {
    ...query,
    ads,
  };
}
