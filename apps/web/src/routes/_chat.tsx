import { Outlet, createFileRoute } from "@tanstack/react-router";

import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import Sidebar from "../components/Sidebar";

function ChatRouteLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground isolate">
      <Sidebar />
      <DiffWorkerPoolProvider>
        <Outlet />
      </DiffWorkerPoolProvider>
    </div>
  );
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});

