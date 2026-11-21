// A focused task (checking in, preparing a request, reading one request) is a
// page of its own, outside the sections: no bar in the way, one thing to do.
export function Focused({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pb-6 pt-5">{children}</div>;
}
