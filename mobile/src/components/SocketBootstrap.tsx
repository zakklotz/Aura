import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../store/queryKeys";
import { socketService } from "../services/socket/socketService";
import { fetchBootstrap } from "../services/api/softphoneApi";

export function SocketBootstrap({
  queryClient,
  isSignedIn,
}: {
  queryClient: QueryClient;
  isSignedIn: boolean;
}) {
  const bootstrap = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: fetchBootstrap,
    enabled: isSignedIn,
  });

  useEffect(() => {
    if (!isSignedIn) {
      socketService.disconnect();
      return;
    }

    const socket = socketService.connect(bootstrap.data?.business?.id ?? null);
    const refetchAll = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threads });
      queryClient.invalidateQueries({ queryKey: queryKeys.mailbox });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentCalls });
      queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
      queryClient.invalidateQueries({ queryKey: queryKeys.callSession });
    };

    socket.on("connect", refetchAll);
    socket.on("reconnect", refetchAll);
    socket.on("threads.updated", refetchAll);
    socket.on("mailbox.updated", refetchAll);
    socket.on("call.state", refetchAll);
    socket.on("badge.updated", refetchAll);

    return () => {
      socket.off("connect", refetchAll);
      socket.off("reconnect", refetchAll);
      socket.off("threads.updated", refetchAll);
      socket.off("mailbox.updated", refetchAll);
      socket.off("call.state", refetchAll);
      socket.off("badge.updated", refetchAll);
    };
  }, [bootstrap.data?.business?.id, isSignedIn, queryClient]);

  return null;
}
