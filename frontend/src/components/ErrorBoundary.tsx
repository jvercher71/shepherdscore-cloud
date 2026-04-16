import { Component, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f8f9fa', padding: 24,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: '40px 48px', maxWidth: 480,
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>!</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#1a1a2e' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 24 }}>
              An unexpected error occurred. Please try refreshing the page.
              If the problem persists, contact your administrator.
            </p>
            {this.state.error && (
              <p style={{
                fontSize: 12, color: '#999', background: '#f8f9fa', borderRadius: 8,
                padding: '8px 12px', marginBottom: 20, wordBreak: 'break-word',
              }}>
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/' }}
              style={{
                background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8,
                padding: '12px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Refresh & Go Home
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
