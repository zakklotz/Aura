import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../store/queryKeys";
import { socketService } from "../services/socket/socketService";
import { fetchBootstrap } from "../services/api/softphoneApi";
import { refreshOnSocketEvent } from "../services/query/communicationRefresh";

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

    const businessId = bootstrap.data?.business?.id ?? null;
    if (!businessId) {
      return;
    }

    const socket = socketService.connect(businessId);
    const handleConnect = () => {
      void refreshOnSocketEvent(queryClient, "connect");
    };
    const handleReconnect = () => {
      void refreshOnSocketEvent(queryClient, "reconnect");
    };
    const handleThreadsUpdated = () => {
      void refreshOnSocketEvent(queryClient, "threads.updated");
    };
    const handleThreadItemsCreated = (payload: { threadId?: string | null }) => {
      void refreshOnSocketEvent(queryClient, "thread.items.created", payload);
    };
    const handleMailboxUpdated = () => {
      void refreshOnSocketEvent(queryClient, "mailbox.updated");
    };
    const handleCallState = () => {
      void refreshOnSocketEvent(queryClient, "call.state");
    };
    const handleBadgeUpdated = () => {
      void refreshOnSocketEvent(queryClient, "badge.updated");
    };

    socket.on("connect", handleConnect);
    socket.on("reconnect", handleReconnect);
    socket.on("threads.updated", handleThreadsUpdated);
    socket.on("thread.items.created", handleThreadItemsCreated);
    socket.on("mailbox.updated", handleMailboxUpdated);
    socket.on("call.state", handleCallState);
    socket.on("badge.updated", handleBadgeUpdated);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("reconnect", handleReconnect);
      socket.off("threads.updated", handleThreadsUpdated);
      socket.off("thread.items.created", handleThreadItemsCreated);
      socket.off("mailbox.updated", handleMailboxUpdated);
      socket.off("call.state", handleCallState);
      socket.off("badge.updated", handleBadgeUpdated);
    };
  }, [bootstrap.data?.business?.id, isSignedIn, queryClient]);

  return null;
}
