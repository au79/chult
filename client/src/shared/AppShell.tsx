type AppShellProps = {
  role: "dm" | "player";
};

export function AppShell({ role }: AppShellProps) {
  return (
    <main className="container" data-role={role}>
      <section style={{ padding: "1rem" }}>
        <h1>Map of Chult</h1>
        <p>{role === "dm" ? "DM view" : "Player view"} is now React-powered.</p>
      </section>
    </main>
  );
}
