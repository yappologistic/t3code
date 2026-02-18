import { Outlet, createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

import DiffPanel from "../components/DiffPanel";
import Sidebar from "../components/Sidebar";
import { useStore } from "../store";

function ChatRouteLayout() {
  const { state } = useStore();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const routeThreadId = typeof params.threadId === "string" ? params.threadId : null;

  useEffect(() => {
    if (routeThreadId || !state.activeThreadId) return;
    void navigate({
      to: "/$threadId",
      params: { threadId: state.activeThreadId },
      replace: true,
    });
  }, [navigate, routeThreadId, state.activeThreadId]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground isolate">
      <Sidebar />
      <Outlet />
      {state.diffOpen && <DiffPanel />}
    </div>
  );
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});
