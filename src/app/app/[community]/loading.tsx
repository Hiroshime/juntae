export default function CommunityDashboardLoading() {
  return (
    <main className="shell">
      <div className="container dashboard-loading" aria-label="Carregando dashboard">
        <div className="skeleton skeleton-header" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-opportunities" />
        <div className="grid grid-2">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    </main>
  );
}
