import { Component, type ReactNode } from "react";

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-3xl text-parchment">Something went wrong</h1>
          <p className="mt-3 text-sm text-red-300 break-words">{this.state.error.message}</p>
          <button className="mt-6 rounded bg-forest px-4 py-2 text-parchment" onClick={() => location.reload()}>Reload</button>
        </div>
      </main>
    );
  }
}
