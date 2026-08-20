import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export default class AssistantRecoveryBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <section className="flex h-full min-h-0 flex-col overflow-auto rounded-2xl border border-amber-300/30 bg-slate-950 p-6 text-slate-100">
        <div className="m-auto w-full max-w-xl rounded-2xl border border-amber-300/20 bg-amber-300/5 p-6">
          <AlertTriangle className="mb-4 size-8 text-amber-300" />
          <h2 className="text-lg font-semibold text-amber-100">Assistant response recover nahi ho saki</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Aik pasted message ya rendered code block ne is screen ko interrupt kiya. Aapki saved history delete nahi hui. Retry se chat shell dobara render hogi; agar masla rahe to page reload karein.</p>
          {this.state.error?.message && <pre className="mt-4 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-xs text-slate-400">{this.state.error.message}</pre>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={this.handleRetry} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><RefreshCw className="mr-2 size-4" /> Retry Assistant</Button>
            <Button type="button" variant="outline" onClick={() => window.location.reload()} className="border-slate-700 text-slate-200">Reload page</Button>
          </div>
        </div>
      </section>
    );
  }
}
