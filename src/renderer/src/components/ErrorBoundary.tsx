import React from 'react';
import { Result, Button } from 'antd';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error?: Error; }

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }
  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };
  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="页面出错了"
          subTitle={this.state.error?.message || '未知错误'}
          extra={<Button type="primary" onClick={this.handleReset}>重试</Button>}
        />
      );
    }
    return this.props.children;
  }
}
export default ErrorBoundary;
