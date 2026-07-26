/** 登录页 */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert, Space } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../services/authStore';

const { Title, Text } = Typography;

const Login = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const from = params.get('from') || '/dashboard';
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (values: { username: string; password: string }) => {
    setError('');
    setLoading(true);
    try {
      await login(values.username, values.password);
      navigate(from, { replace: true });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '登录失败，请检查用户名密码';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
      }}
    >
      <Card style={{ width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={3} style={{ margin: 0 }}>QuantTerminal</Title>
            <Text type="secondary">A股量化研究平台</Text>
          </div>

          {error && <Alert type="error" message={error} showIcon closable />}

          <Form
            name="login"
            initialValues={{ username: 'admin', password: '' }}
            onFinish={onSubmit}
            autoComplete="off"
          >
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined />} placeholder="用户名" size="large" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" size="large" block loading={loading}>
                登录
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'center', fontSize: 12, color: '#999' }}>
            默认账号 admin / admin123
          </div>
        </Space>
      </Card>
    </div>
  );
};

export default Login;
